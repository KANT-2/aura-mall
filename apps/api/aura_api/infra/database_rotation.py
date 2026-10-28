"""Validated, process-local DB generations with an acknowledgement for the operator.

The operator publishes a URL atomically. Every worker probes both drivers, switches new
leases to that generation and drains old leases before acknowledging retirement. No
transaction is replayed and no checked-out connection is terminated by rotation.
"""

import asyncio
import hashlib
import json
import os
import socket
import sys
import tempfile
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import psycopg
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from aura_api.config import Settings
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.database_errors import DatabaseUnavailable

PROBE = """SELECT current_user, current_setting('transaction_read_only'),
    EXISTS (SELECT FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl)"""


def version_of(url: str) -> str:
    return hashlib.sha256(url.strip().encode()).hexdigest()


def process_start(pid: int) -> str | None:
    try:
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
    except (OSError, IndexError):
        return None


@dataclass(eq=False, repr=False)
class Generation:
    version: str
    dsn: str
    engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]
    leases: int = 0


class RotatingDatabase:
    def __init__(self, source: Path, registry: Path | None, *, interval: float = 0.5):
        self.source = source
        self.registry = registry
        self.interval = interval
        self._current: Generation | None = None
        self._retired: list[Generation] = []
        self._lock = asyncio.Lock()
        self._reload_lock = asyncio.Lock()
        self._cleanup_lock = asyncio.Lock()
        self._watcher: asyncio.Task | None = None
        self._ack: Path | None = None
        self._identity: dict = {}
        self._candidate_failed = False

    async def _probe(self, generation: Generation):
        username = make_url(generation.dsn).username
        expected = (username, "off", True)
        async with asyncio.timeout(8):
            async with generation.engine.connect() as connection:
                if tuple((await connection.execute(text(PROBE))).one()) != expected:
                    raise DatabaseUnavailable("Database must be a verified, writable primary")
            async with await psycopg.AsyncConnection.connect(
                generation.dsn, connect_timeout=3
            ) as connection:
                row = await (await connection.execute(PROBE)).fetchone()
                if row != expected:
                    raise DatabaseUnavailable("Authentication database probe failed")

    async def _build(self, value: str) -> Generation:
        engine = None
        try:
            Settings.validate_database_url(SecretStr(value))
            url = make_url(value).set(drivername="postgresql")
            if url.query.get("sslmode") != "verify-full" or not url.query.get("sslrootcert"):
                raise DatabaseUnavailable("Managed database connections require verified TLS")
            engine = create_engine(value)
            generation = Generation(
                version_of(value),
                url.render_as_string(hide_password=False),
                engine,
                create_sessionmaker(engine),
            )
            await self._probe(generation)
            return generation
        except BaseException as error:
            if engine is not None:
                await engine.dispose()
            if not isinstance(error, Exception):
                raise
            raise DatabaseUnavailable("Cannot validate the new database configuration") from None

    def _publish(self):
        if self._ack is None:
            return
        record = {
            **self._identity,
            "version": self._current.version if self._current else None,
            "retired": len(self._retired),
            "candidate_failed": self._candidate_failed,
            "heartbeat": time.time(),
        }
        fd, name = tempfile.mkstemp(prefix=".ack-", dir=self._ack.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                stream.write(json.dumps(record))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self._ack)
        finally:
            Path(name).unlink(missing_ok=True)

    async def start(self):
        # Register before reading the URL: a starting worker cannot hide an old snapshot.
        pid = os.getpid()
        self._identity = {"pid": pid, "start": process_start(pid), "instance": uuid4().hex}
        if self.registry is not None:
            self.registry.mkdir(mode=0o700, parents=True, exist_ok=True)
            # Keep files directly in the host-owned mount: its owner can remove stale
            # records even when the container's process runs as root.
            self._ack = self.registry / (
                f"{socket.gethostname()}-{pid}-{self._identity['instance']}.json"
            )
        self._publish()
        try:
            await self.refresh()
        except BaseException:
            if self._ack is not None:
                self._ack.unlink(missing_ok=True)
            raise
        self._watcher = asyncio.create_task(self._watch(), name="database-configuration")

    async def _watch(self):
        while True:
            await asyncio.sleep(self.interval)
            try:
                await self.refresh()
            except DatabaseUnavailable:
                # Old, already validated connections remain usable. No secret is logged.
                self._candidate_failed = True
            await self._cleanup()
            self._publish()

    async def refresh(self):
        async with self._reload_lock:
            try:
                value = self.source.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeError):
                raise DatabaseUnavailable("Cannot read the database configuration") from None
            version = version_of(value)
            async with self._lock:
                if self._current is not None and self._current.version == version:
                    self._candidate_failed = False
                    return
            # Probing runs outside the lease lock: requests keep using the current pool.
            candidate = await self._build(value)
            async with self._lock:
                if self._current is not None:
                    self._retired.append(self._current)
                self._current = candidate
                self._candidate_failed = False
                self._publish()
            await self._cleanup()
            self._publish()

    async def _cleanup(self):
        async with self._cleanup_lock:
            async with self._lock:
                idle = [generation for generation in self._retired if generation.leases == 0]
            for generation in idle:
                await generation.engine.dispose()
                async with self._lock:
                    self._retired.remove(generation)
            if idle:
                self._publish()

    @asynccontextmanager
    async def lease(self) -> AsyncIterator[Generation]:
        async with self._lock:
            generation = self._current
            if generation is None:
                raise DatabaseUnavailable("Database configuration is not ready")
            generation.leases += 1
        try:
            yield generation
        finally:
            async with self._lock:
                generation.leases -= 1
            await self._cleanup()

    async def ready(self):
        try:
            async with self.lease() as generation:
                await self._probe(generation)
        except Exception:
            raise DatabaseUnavailable("Database is unavailable") from None

    async def close(self):
        if self._watcher is not None:
            self._watcher.cancel()
            with suppress(asyncio.CancelledError):
                await self._watcher
        async with self._lock:
            if self._current is not None:
                self._retired.append(self._current)
                self._current = None
        await self._cleanup()
        if self._ack is not None:
            self._ack.unlink(missing_ok=True)


def acknowledged_workers(registry: Path, expected: str, *, max_age: float = 10) -> list[dict]:
    """Run inside each API container so PID identity/liveness is checked in its namespace."""
    workers = []
    for path in registry.glob(f"{socket.gethostname()}-*.json"):
        try:
            record = json.loads(path.read_text())
            start = process_start(record["pid"])
            if start is None or start != record["start"]:
                continue
            if (
                record["version"] != expected
                or record["retired"] != 0
                or record["candidate_failed"]
                or not 0 <= time.time() - record["heartbeat"] <= max_age
            ):
                raise DatabaseUnavailable("An API worker has not finished the database transition")
            workers.append(record)
        except (OSError, ValueError, KeyError, TypeError):
            raise DatabaseUnavailable("Cannot verify an API worker acknowledgement") from None
    if not workers:
        raise DatabaseUnavailable("No live API worker acknowledgement is available")
    return workers


def main():
    try:
        payload = json.load(sys.stdin)
        registry = Path(os.environ["AURA_DATABASE_RUNTIME_DIR"])
        workers = acknowledged_workers(registry, payload["version"])
        print(
            json.dumps(
                {
                    "processes": [
                        {key: worker[key] for key in ("pid", "start", "instance")}
                        for worker in workers
                    ]
                }
            )
        )
    except (DatabaseUnavailable, OSError, ValueError, KeyError, TypeError):
        raise SystemExit(
            "API workers have not acknowledged and drained this DB generation"
        ) from None


if __name__ == "__main__":
    main()
