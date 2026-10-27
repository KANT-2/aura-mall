#!/usr/bin/env python3
"""Opt-in PostgreSQL operations. Only stdlib, OpenSSL and Docker Compose are required.

Secrets travel through stdin or owner-readable files, never command arguments or logs.
All commands share a host lock; interrupted rotations recover from a durable journal.
"""

import argparse
import fcntl
import json
import os
import secrets
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
VERIFY_API = """
import asyncio
import psycopg
from sqlalchemy import text
from aura_api.config import Settings
from aura_api.infra.database import create_engine
async def main():
    url = Settings().database_url.get_secret_value()
    query = "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()"
    engine = create_engine(url)
    try:
        async with engine.connect() as con:
            assert await con.scalar(text(query)) is True
            assert await con.scalar(text("SHOW transaction_read_only")) == "off"
        async with await psycopg.AsyncConnection.connect(url, connect_timeout=5) as con:
            row = await (await con.execute(query)).fetchone()
            assert row == (True,)
    finally:
        await engine.dispose()
asyncio.run(main())
"""


class OperationError(Exception):
    def __init__(self, message, diagnostics=b""):
        super().__init__(message)
        self.diagnostics = diagnostics


def run(args, *, data=None, check=True, output=None, timeout=180):
    result = subprocess.run(
        list(map(str, args)),
        input=data.encode() if isinstance(data, str) else data,
        stdout=output if output is not None else subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    if check and result.returncode:
        # Do not expose stderr: PostgreSQL failures can include secret-bearing SQL.
        raise OperationError(
            f"{args[0]} failed (exit {result.returncode}); check service health", result.stderr
        )
    return result


def atomic(path, content, mode=0o600):
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def retry(action, seconds=60):
    deadline = time.monotonic() + seconds
    while True:
        try:
            return action()
        except (OperationError, subprocess.TimeoutExpired):
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)


class Database:
    def __init__(self, project):
        self.project = project
        self.home = ROOT / ".db-ops"
        self.home.mkdir(mode=0o700, exist_ok=True)
        self.home.chmod(0o700)
        self.state = self.home / "state"
        for name in ("state", "ca", "server", "client", "replication", "backups"):
            (self.home / name).mkdir(
                mode=0o755 if name in {"server", "client"} else 0o700, exist_ok=True
            )
            (self.home / name).chmod(0o755 if name in {"server", "client"} else 0o700)
        self.client = self.home / "client"
        self.ca = self.home / "ca"
        self.server = self.home / "server"
        self.url_file = self.client / "database-url"
        self.journal = self.state / "rotation.json"
        self.compose = [
            "docker",
            "compose",
            "--project-directory",
            str(ROOT),
            "-p",
            project,
            "-f",
            str(ROOT / "compose.yaml"),
            "-f",
            str(ROOT / "compose.database.yaml"),
        ]

    def dc(self, *args, **kwargs):
        return run([*self.compose, *args], **kwargs)

    def read(self, name, default=None):
        path = self.state / name
        return json.loads(path.read_text()) if path.exists() else default

    def write(self, name, value):
        atomic(self.state / name, json.dumps(value) + "\n")

    @property
    def primary(self):
        return self.read("primary.json", "db")

    @property
    def standby(self):
        return "db-standby" if self.primary == "db" else "db"

    def sql(self, service, statement):
        # Administrative SQL uses the local socket, with no password passed to Docker.
        result = self.dc(
            "exec",
            "-T",
            service,
            "sh",
            "-c",
            'exec psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
            data="SET log_statement=none; SET log_min_error_statement=panic; "
            "SET log_min_duration_statement=-1;\n" + statement,
        )
        # Quiet suppresses SET command tags so scalar queries remain parseable.
        return "\n".join(
            line for line in result.stdout.decode().strip().splitlines() if line != "SET"
        )

    def running(self, service):
        return bool(self.dc("ps", "--status", "running", "-q", service).stdout.strip())

    def require_primary(self):
        if self.sql(self.primary, "SELECT pg_is_in_recovery();") != "f":
            raise OperationError("The configured writer is not a primary")

    def checkend(self, cert, days):
        return (
            run(
                [
                    "openssl",
                    "x509",
                    "-in",
                    cert,
                    "-checkend",
                    str(days * 86400),
                    "-noout",
                ],
                check=False,
            ).returncode
            == 0
        )

    def init(self):
        key, cert = self.ca / "ca.key", self.ca / "ca.crt"
        if key.exists() != cert.exists():
            raise OperationError("Incomplete CA; restore the original CA before continuing")
        if not cert.exists():
            run(
                [
                    "openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:3072",
                    "-nodes",
                    "-sha256",
                    "-keyout",
                    key,
                    "-out",
                    cert,
                    "-days",
                    "3650",
                    "-subj",
                    "/CN=AURA Database CA",
                    "-addext",
                    "basicConstraints=critical,CA:TRUE,pathlen:0",
                    "-addext",
                    "keyUsage=critical,keyCertSign,cRLSign",
                ]
            )
            key.chmod(0o600)
        # Never silently replace an established trust anchor.
        public_ca = self.client / "ca.crt"
        if public_ca.exists() and public_ca.read_bytes() != cert.read_bytes():
            raise OperationError("Client CA differs; use an explicit CA rollover procedure")
        atomic(public_ca, cert.read_text(), 0o644)
        if not (self.server / "current").exists():
            self.issue_certificate()
        if self.read("primary.json") is None:
            self.write("primary.json", "db")

    def publish(self, generation):
        link = self.server / ".current-new"
        link.unlink(missing_ok=True)
        link.symlink_to(generation)
        os.replace(link, self.server / "current")

    def issue_certificate(self):
        if not self.checkend(self.ca / "ca.crt", 120):
            raise OperationError("CA expires within 120 days; complete CA rollover first")
        stage = Path(tempfile.mkdtemp(prefix="generation-", dir=self.server))
        stage.chmod(0o755)
        atomic(
            stage / "extensions.cnf",
            "\n".join(
                [
                    "basicConstraints=critical,CA:FALSE",
                    "keyUsage=critical,digitalSignature,keyEncipherment",
                    "extendedKeyUsage=serverAuth",
                    "subjectAltName=DNS:db,DNS:db-standby,DNS:localhost,IP:127.0.0.1,IP:::1",
                    "",
                ]
            ),
        )
        run(
            [
                "openssl",
                "req",
                "-new",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-sha256",
                "-keyout",
                stage / "server.key",
                "-out",
                stage / "server.csr",
                "-subj",
                "/CN=db",
            ]
        )
        (stage / "server.key").chmod(0o600)
        run(
            [
                "openssl",
                "x509",
                "-req",
                "-in",
                stage / "server.csr",
                "-sha256",
                "-CA",
                self.ca / "ca.crt",
                "-CAkey",
                self.ca / "ca.key",
                "-set_serial",
                str(secrets.randbits(128) or 1),
                "-days",
                "90",
                "-extfile",
                stage / "extensions.cnf",
                "-out",
                stage / "server.crt",
            ]
        )
        (stage / "server.crt").chmod(0o644)
        run(
            [
                "openssl",
                "verify",
                "-CAfile",
                self.ca / "ca.crt",
                "-purpose",
                "sslserver",
                stage / "server.crt",
            ]
        )
        self.publish(stage.name)

    def serial(self, *, certificate=None, data=None):
        args = ["openssl", "x509", "-noout", "-serial"]
        if certificate is not None:
            args.extend(["-in", certificate])
        return run(args, data=data).stdout.strip()

    def install_certificates(self):
        expected = self.serial(certificate=self.server / "current" / "server.crt")
        for service in ("db", "db-standby"):
            if not self.running(service):
                continue
            self.dc(
                "exec",
                "-T",
                "--user",
                "root",
                service,
                "sh",
                "/opt/aura-postgres/install-tls.sh",
            )
            if self.sql(service, "SELECT pg_reload_conf();") != "t":
                raise OperationError("PostgreSQL refused configuration reload")

            def check_served(service=service):
                cert = self.dc(
                    "exec",
                    "-T",
                    service,
                    "openssl",
                    "s_client",
                    "-starttls",
                    "postgres",
                    "-connect",
                    f"{service}:5432",
                    "-CAfile",
                    "/run/aura-ca.crt",
                    "-verify_hostname",
                    service,
                    "-verify_return_error",
                    data="",
                    timeout=15,
                ).stdout
                if self.serial(data=cert) != expected:
                    raise OperationError("The server is still presenting the old certificate")

            retry(check_served, 30)

    def renew(self, force=False):
        current = self.server / "current"
        previous = os.readlink(current)
        if force or not self.checkend(current / "server.crt", 30):
            self.issue_certificate()
        try:
            # Also converges a renewal interrupted between publication and reload.
            self.install_certificates()
        except (OperationError, subprocess.TimeoutExpired):
            self.publish(previous)
            self.install_certificates()
            raise

    def replication_password(self):
        return (self.home / "replication" / "pgpass").read_text().strip().rsplit(":", 1)[1]

    def set_replication_password(self, password):
        self.sql(self.primary, f"ALTER ROLE aura_replicator PASSWORD {literal(password)};")
        atomic(
            self.home / "replication" / "pgpass",
            f"*:5432:replication:aura_replicator:{password}\n",
        )
        if self.running(self.standby):
            self.dc(
                "exec",
                "-T",
                "--user",
                "root",
                self.standby,
                "sh",
                "/opt/aura-postgres/install-replication.sh",
            )
            self.sql(
                self.primary,
                "SELECT pg_terminate_backend(pid) FROM pg_stat_replication "
                "WHERE application_name='aura_standby';",
            )
            self.wait_replica()

    def wait_replica(self):
        if not self.running(self.standby):
            raise OperationError("Standby is down; rejoin a standby before rotating credentials")

        def streaming():
            if (
                self.sql(
                    self.primary,
                    "SELECT count(*) FROM pg_stat_replication "
                    "WHERE application_name='aura_standby' AND state='streaming';",
                )
                != "1"
            ):
                raise OperationError("Standby is not streaming")

        retry(streaming)
        lsn = self.sql(self.primary, "SELECT pg_current_wal_lsn();")

        def replayed():
            if (
                self.sql(
                    self.standby,
                    "SELECT pg_is_in_recovery() AND "
                    f"pg_last_wal_replay_lsn() >= {literal(lsn)}::pg_lsn;",
                )
                != "t"
            ):
                raise OperationError("Standby has not replayed the required WAL")

        retry(replayed)

    def verify_api(self):
        retry(lambda: self.dc("exec", "-T", "api", "python", "-c", VERIFY_API, timeout=20))

    def restart_api(self):
        self.dc("up", "-d", "--no-deps", "--force-recreate", "api", timeout=180)
        self.verify_api()

    def deploy_api(self):
        self.recover_rotation()
        self.dc("up", "-d", "--build", "--no-deps", "api", timeout=600)
        self.status()

    def bootstrap(self):
        if self.primary != "db" or (self.state / "fenced-primary").exists():
            raise OperationError("Bootstrap cannot unfence a promoted cluster")
        self.dc("up", "-d", "--wait", "db")
        self.require_primary()
        if self.sql("db", "SELECT rolsuper FROM pg_roles WHERE rolname=current_user;") != "t":
            raise OperationError("Bootstrap requires the existing local database administrator")
        if (
            self.sql(
                "db",
                "SELECT current_user IN "
                "('aura_runtime','aura_app_a','aura_app_b','aura_replicator');",
            )
            != "f"
        ):
            raise OperationError("The administrator conflicts with reserved runtime roles")
        self.sql(
            "db",
            """
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aura_runtime') THEN
    CREATE ROLE aura_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aura_app_a') THEN
    CREATE ROLE aura_app_a NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aura_app_b') THEN
    CREATE ROLE aura_app_b NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aura_replicator') THEN
    CREATE ROLE aura_replicator LOGIN REPLICATION;
  END IF;
END $$;
ALTER ROLE aura_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE aura_app_a INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE aura_app_b INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE aura_replicator LOGIN REPLICATION NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT aura_runtime TO aura_app_a, aura_app_b;
GRANT USAGE ON SCHEMA public TO aura_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aura_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aura_runtime;
DO $$ DECLARE owner_name text; BEGIN
  FOR owner_name IN SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public'
      UNION SELECT current_user LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                   'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aura_runtime', owner_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                   'GRANT USAGE, SELECT ON SEQUENCES TO aura_runtime', owner_name);
  END LOOP;
END $$;
SELECT pg_create_physical_replication_slot('aura_standby')
 WHERE NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name='aura_standby');
""",
        )
        if not (self.home / "replication" / "pgpass").exists():
            self.set_replication_password(secrets.token_urlsafe(48))
        else:
            self.set_replication_password(self.replication_password())
        if not self.url_file.exists():
            password = secrets.token_urlsafe(48)
            self.sql("db", f"ALTER ROLE aura_app_a LOGIN PASSWORD {literal(password)};")
            database = self.sql("db", "SELECT current_database();")
            query = urlencode(
                {"sslmode": "verify-full", "sslrootcert": "/run/aura-db-client/ca.crt"}
            )
            atomic(
                self.url_file,
                f"postgresql://aura_app_a:{password}@db:5432/{quote(database, safe='')}?{query}\n",
            )
            self.write("rotated.json", time.time())
        self.dc("up", "-d", "--wait", "db-standby", timeout=300)
        self.wait_replica()
        self.install_certificates()
        self.dc("up", "-d", "--build", "--no-deps", "api", timeout=600)
        self.verify_api()

    def finish_rotation(self, record):
        old_user = unquote(urlsplit(record["old_url"]).username)
        self.sql(
            self.primary,
            f"ALTER ROLE {identifier(old_user)} NOLOGIN; "
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE usename={literal(old_user)} AND pid<>pg_backend_pid();",
        )
        self.wait_replica()
        self.write("rotated.json", time.time())
        self.journal.unlink()

    def recover_rotation(self):
        if not self.journal.exists():
            return
        record = json.loads(self.journal.read_text())
        if record["phase"] == "committed":
            if self.url_file.read_text().strip() != record["new_url"]:
                raise OperationError(
                    "Committed rotation URL differs; restore consistent state first"
                )
            self.verify_api()
            self.finish_rotation(record)
            return
        old_user = unquote(urlsplit(record["old_url"]).username)
        self.sql(self.primary, f"ALTER ROLE {identifier(old_user)} LOGIN;")
        self.set_replication_password(record["old_replication_password"])
        atomic(self.url_file, record["old_url"] + "\n")
        self.restart_api()
        self.sql(self.primary, f"ALTER ROLE {identifier(record['new_user'])} NOLOGIN;")
        self.journal.unlink()

    def rotate(self):
        self.require_primary()
        self.recover_rotation()
        self.wait_replica()
        old_url = self.url_file.read_text().strip()
        parts = urlsplit(old_url)
        if parts.username not in {"aura_app_a", "aura_app_b"}:
            raise OperationError("Only the managed application login roles can be rotated")
        new_user = "aura_app_b" if parts.username == "aura_app_a" else "aura_app_a"
        password = secrets.token_urlsafe(48)
        new_url = urlunsplit(parts._replace(netloc=f"{new_user}:{password}@{parts.hostname}:5432"))
        record = {
            "phase": "prepared",
            "old_url": old_url,
            "new_user": new_user,
            "new_url": new_url,
            "old_replication_password": self.replication_password(),
        }
        atomic(self.journal, json.dumps(record))
        try:
            self.sql(
                self.primary,
                f"ALTER ROLE {identifier(new_user)} LOGIN PASSWORD {literal(password)};",
            )
            self.set_replication_password(secrets.token_urlsafe(48))
            self.wait_replica()
            atomic(self.url_file, new_url + "\n")
            self.restart_api()
            record["phase"] = "committed"
            atomic(self.journal, json.dumps(record))
        except (OperationError, subprocess.TimeoutExpired):
            self.recover_rotation()
            raise
        self.finish_rotation(record)

    def backup(self):
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        directory = self.home / "backups"
        for suffix, command in [
            (
                "dump",
                'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom',
            ),
            ("globals.sql", 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only'),
        ]:
            pending = directory / f".aura-{stamp}.{suffix}.partial"
            with pending.open("wb") as output:
                self.dc(
                    "exec",
                    "-T",
                    self.primary,
                    "sh",
                    "-c",
                    command,
                    output=output,
                    timeout=600,
                )
                output.flush()
                os.fsync(output.fileno())
            os.replace(pending, directory / f"aura-{stamp}.{suffix}")
        self.write("backup.json", time.time())
        # Keep 14 days. Only delete files produced by this command, after a successful pair.
        for path in directory.glob("aura-*"):
            if path.is_file() and path.stat().st_mtime < time.time() - 14 * 86400:
                path.unlink()

    def promote(self, allow_data_loss=False):
        if (self.state / "rejoin-primary").exists():
            raise OperationError("The standby was already promoted and rejoined; use the runbook")
        if self.journal.exists():
            raise OperationError("Recover the pending rotation before promoting")
        self.dc("stop", "api")
        if not (self.state / "fenced-primary").exists():
            if not allow_data_loss:
                self.wait_replica()
            atomic(self.state / "fenced-primary", "Fenced after standby promotion\n")
        self.dc("stop", "db")
        if self.running("db"):
            raise OperationError("Cannot confirm the former primary is stopped")
        if self.sql("db-standby", "SELECT pg_is_in_recovery();") == "t":
            if self.sql("db-standby", "SELECT pg_promote(true, 60);") != "t":
                raise OperationError("Standby promotion failed; the old writer remains fenced")
        self.write("primary.json", "db-standby")
        parts = urlsplit(self.url_file.read_text().strip())
        atomic(
            self.url_file,
            urlunsplit(parts._replace(netloc=f"{parts.username}:{parts.password}@db-standby:5432"))
            + "\n",
        )
        self.restart_api()
        print("Standby promoted; former primary is fenced. Rejoin a new standby before rotation.")

    def rejoin(self):
        if self.primary != "db-standby" or not (self.state / "fenced-primary").exists():
            raise OperationError("Rejoin is only valid after a completed standby promotion")
        self.require_primary()
        self.sql(
            self.primary,
            "SELECT pg_create_physical_replication_slot('aura_standby') "
            "WHERE NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name='aura_standby');",
        )
        atomic(self.state / "rejoin-primary", "Start the former primary only as a standby\n")
        self.dc("up", "-d", "--wait", "--wait-timeout", "600", "db", timeout=660)
        self.wait_replica()
        self.status()

    def status(self):
        self.require_primary()
        self.verify_api()
        self.wait_replica()
        if not self.checkend(self.server / "current" / "server.crt", 7):
            raise OperationError("Server certificate expires within 7 days")
        if not self.checkend(self.ca / "ca.crt", 365):
            raise OperationError("CA expires within a year; schedule an overlapping CA rollover")
        print(
            json.dumps(
                {
                    "primary": self.primary,
                    "standby": "streaming",
                    "standby_service": self.standby,
                    "tls": "verified",
                    "last_password_rotation": self.read("rotated.json"),
                    "last_backup": self.read("backup.json"),
                }
            )
        )

    def maintain(self):
        self.require_primary()
        self.renew()
        self.recover_rotation()
        # Preserve backups even while the cluster is degraded after promotion.
        if time.time() - self.read("backup.json", 0) >= 20 * 3600:
            self.backup()
        if time.time() - self.read("rotated.json", 0) >= 90 * 86400:
            self.rotate()
        self.status()

    def install_timer(self):
        directory = Path.home() / ".config/systemd/user"
        directory.mkdir(parents=True, exist_ok=True)
        escaped = str(ROOT).replace("%", "%%").replace('"', '\\"')
        atomic(
            directory / "aura-db-maintenance.service",
            f"""[Unit]
Description=AURA database TLS renewal, credentials, backup and replication checks

[Service]
Type=oneshot
WorkingDirectory="{escaped}"
ExecStart=/usr/bin/python3 "{escaped}/ops/database.py" --project {self.project} maintain
UMask=0077
TimeoutStartSec=15min
""",
            0o644,
        )
        atomic(
            directory / "aura-db-maintenance.timer",
            """[Unit]
Description=Daily AURA database maintenance

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=30min
Persistent=true

[Install]
WantedBy=timers.target
""",
            0o644,
        )
        run(["systemctl", "--user", "daemon-reload"])
        run(["systemctl", "--user", "enable", "--now", "aura-db-maintenance.timer"])
        print("Daily timer enabled. Ensure this user's systemd manager has lingering enabled.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.environ.get("COMPOSE_PROJECT_NAME", "aura"))
    parser.add_argument(
        "command",
        choices=[
            "init",
            "bootstrap",
            "renew",
            "rotate",
            "backup",
            "promote",
            "rejoin",
            "status",
            "maintain",
            "install-timer",
            "deploy-api",
        ],
    )
    parser.add_argument("--force", action="store_true", help="Renew a certificate before it is due")
    parser.add_argument(
        "--allow-data-loss",
        action="store_true",
        help="Emergency promotion without confirming all committed WAL was replayed",
    )
    args = parser.parse_args()
    if not args.project or any(
        c not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for c in args.project
    ):
        parser.error("Use a lowercase Compose project name")
    os.umask(0o077)
    database = Database(args.project)
    with (database.home / "operations.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another database operation is running") from None
        try:
            if args.command == "renew":
                database.renew(args.force)
            elif args.command == "promote":
                database.promote(args.allow_data_loss)
            else:
                getattr(database, args.command.replace("-", "_"))()
        except OperationError as error:
            raise SystemExit(str(error)) from None
        except (subprocess.TimeoutExpired, OSError):
            raise SystemExit(
                "Database operation failed; inspect container state and the runbook. "
                "Secret-bearing command output has been suppressed."
            ) from None


if __name__ == "__main__":
    main()
