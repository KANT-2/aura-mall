"""Concurrency and acknowledgement checks; real driver/TLS coverage is in ops/test_database.py."""

import asyncio
import json
import socket
import time
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi.testclient import TestClient

from aura_api import main
from aura_api.config import Settings
from aura_api.infra import database_rotation as rotation

URL_A = "postgresql://aura_app_a:private-secret-a@db/aura?sslmode=verify-full&sslrootcert=/ca"
URL_B = "postgresql://aura_app_b:private-secret-b@db/aura?sslmode=verify-full&sslrootcert=/ca"


class FakeRuntime(rotation.RotatingDatabase):
    async def _build(self, value):
        if value == "invalid-private-secret":
            raise rotation.DatabaseUnavailable("Candidate probe failed")
        if getattr(self, "building", None) is not None:
            self.building.set()
            await self.allow_build.wait()
        return rotation.Generation(rotation.version_of(value), value, AsyncMock(), Mock())


def runtime(tmp_path):
    source = tmp_path / "url"
    source.write_text(URL_A)
    return FakeRuntime(source, tmp_path / "workers", interval=3600)


def test_switch_keeps_checked_out_generations_until_the_last_lease_finishes(tmp_path):
    async def scenario():
        manager = runtime(tmp_path)
        await manager.start()
        async with manager.lease() as old:
            async with manager.lease() as other:
                assert other is old
                manager.source.write_text(URL_B)
                await manager.refresh()
                async with manager.lease() as new:
                    assert new is not old and new.dsn == URL_B
                old.engine.dispose.assert_not_awaited()
                assert json.loads(manager._ack.read_text())["retired"] == 1
            old.engine.dispose.assert_not_awaited()
        old.engine.dispose.assert_awaited_once()
        assert json.loads(manager._ack.read_text())["retired"] == 0
        assert "private-secret" not in manager._ack.read_text()
        assert "private-secret" not in repr(old)
        await manager.close()
        new.engine.dispose.assert_awaited_once()
        assert not manager._ack.exists()

    asyncio.run(scenario())


def test_candidate_probe_does_not_block_current_requests_or_replace_a_good_generation(tmp_path):
    async def scenario():
        manager = runtime(tmp_path)
        await manager.start()
        old = manager._current
        manager.building, manager.allow_build = asyncio.Event(), asyncio.Event()
        manager.source.write_text(URL_B)
        update = asyncio.create_task(manager.refresh())
        await manager.building.wait()
        async with asyncio.timeout(1), manager.lease() as leased:
            assert leased is old
        manager.allow_build.set()
        await update
        manager.source.write_text("invalid-private-secret")
        with pytest.raises(rotation.DatabaseUnavailable, match="probe failed"):
            await manager.refresh()
        async with manager.lease() as leased:
            assert leased.dsn == URL_B
        await manager.close()

    asyncio.run(scenario())


def test_request_cancellation_releases_old_connections_without_cancelling_other_requests(tmp_path):
    async def scenario():
        manager = runtime(tmp_path)
        await manager.start()
        entered = asyncio.Event()
        old = manager._current

        async def request():
            async with manager.lease():
                entered.set()
                await asyncio.Event().wait()

        request_task = asyncio.create_task(request())
        await entered.wait()
        manager.source.write_text(URL_B)
        await manager.refresh()
        old.engine.dispose.assert_not_awaited()
        request_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await request_task
        old.engine.dispose.assert_awaited_once()
        async with manager.lease() as current:
            assert current.dsn == URL_B
        await manager.close()

    asyncio.run(scenario())


def test_rollback_drains_connections_opened_with_the_rejected_transition(tmp_path):
    async def scenario():
        manager = runtime(tmp_path)
        await manager.start()
        manager.source.write_text(URL_B)
        await manager.refresh()
        async with manager.lease() as pending:
            manager.source.write_text(URL_A)
            await manager.refresh()
            async with manager.lease() as restored:
                assert restored.dsn == URL_A
            pending.engine.dispose.assert_not_awaited()
        pending.engine.dispose.assert_awaited_once()
        assert json.loads(manager._ack.read_text())["retired"] == 0
        await manager.close()

    asyncio.run(scenario())


def worker(registry, pid, version, *, retired=0, heartbeat=None):
    directory = registry
    directory.mkdir(exist_ok=True)
    record = {
        "pid": pid,
        "start": str(pid),
        "instance": f"worker-{pid}",
        "version": version,
        "retired": retired,
        "candidate_failed": False,
        "heartbeat": time.time() if heartbeat is None else heartbeat,
    }
    (directory / f"{socket.gethostname()}-{pid}.json").write_text(json.dumps(record))


@pytest.mark.parametrize("unready", ["old-version", "draining", "stale", "starting"])
def test_every_live_worker_must_acknowledge_and_drain(tmp_path, monkeypatch, unready):
    monkeypatch.setattr(rotation, "process_start", lambda pid: str(pid))
    expected = rotation.version_of(URL_B)
    worker(tmp_path, 101, expected)
    worker(
        tmp_path,
        102,
        expected if unready != "old-version" else rotation.version_of(URL_A),
        retired=1 if unready == "draining" else 0,
        heartbeat=time.time() - 30 if unready == "stale" else None,
    )
    if unready == "starting":
        worker(tmp_path, 102, None)
    with pytest.raises(rotation.DatabaseUnavailable, match="not finished"):
        rotation.acknowledged_workers(tmp_path, expected)
    worker(tmp_path, 102, expected)
    assert len(rotation.acknowledged_workers(tmp_path, expected)) == 2


def test_dead_or_reused_pids_cannot_acknowledge_for_a_live_worker(tmp_path, monkeypatch):
    expected = rotation.version_of(URL_B)
    worker(tmp_path, 101, expected)
    worker(tmp_path, 102, expected)
    monkeypatch.setattr(rotation, "process_start", lambda pid: None if pid == 101 else "reused")
    with pytest.raises(rotation.DatabaseUnavailable, match="No live"):
        rotation.acknowledged_workers(tmp_path, expected)


def test_managed_app_starts_one_shared_runtime_for_both_database_paths(tmp_path, monkeypatch):
    secret = tmp_path / "url"
    secret.write_text(URL_A)
    manager = Mock(start=AsyncMock(), close=AsyncMock())
    factory = Mock(return_value=manager)
    monkeypatch.setattr(main, "RotatingDatabase", factory)
    monkeypatch.setattr(main, "create_engine", Mock(side_effect=AssertionError("Static engine")))
    app = main.create_app(Settings(_env_file=None, database_url_file=secret))
    assert app.state.database_runtime is manager
    assert app.state.auth_repository._runtime is manager
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
    manager.start.assert_awaited_once()
    manager.close.assert_awaited_once()


def test_readiness_failure_does_not_change_liveness_or_expose_secrets():
    app = main.create_app(Settings(_env_file=None))
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/ready").status_code == 503
        app.state.database_runtime = Mock(ready=AsyncMock(side_effect=RuntimeError(URL_A)))
        assert client.get("/ready").status_code == 503
        assert "private-secret" not in client.get("/ready").text
        app.state.database_runtime.ready.side_effect = None
        assert client.get("/ready").status_code == 200
        assert "/ready" not in client.get("/openapi.json").json()["paths"]
