"""Automatic failover acceptance checks, called only with the disposable test DB."""

import fcntl
import importlib.util
import json
import secrets
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SOURCE = Path(__file__).resolve().parent


def exercise(db, cli, module):
    spec = importlib.util.spec_from_file_location("aura_ha_test", SOURCE / "failover.py")
    ha_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ha_module)
    print("11/14 Enable strict synchronous HA on the existing cluster", flush=True)
    cli("ha-enable")
    ha = ha_module.Failover(db)
    ha.require_sync()
    workers = db.wait_api_generation()
    sync_tag = secrets.token_hex(8)
    db.sql(db.standby, "SELECT pg_wal_replay_pause();")
    with ThreadPoolExecutor(max_workers=1) as executor:
        commit = executor.submit(
            db.sql, db.primary, f"INSERT INTO inflight_writes(tag) VALUES ('{sync_tag}');"
        )
        try:

            def waiting_for_replica():
                if (
                    db.sql(
                        db.primary,
                        "SELECT count(*) FROM pg_stat_activity WHERE wait_event='SyncRep';",
                    )
                    == "0"
                ):
                    raise module.OperationError("Commit is not waiting for the replica")

            module.retry(waiting_for_replica, 5)
            assert not commit.done(), "Acknowledged a commit before the replica applied it"
        finally:
            db.sql(db.standby, "SELECT pg_wal_replay_resume();")
        commit.result(timeout=10)
    db.wait_replica()
    print("PASS: a successful commit waits for durable replica replay", flush=True)

    def http(path, method="GET"):
        result = db.dc(
            "exec",
            "-T",
            "api",
            "python",
            "-c",
            "import json,urllib.request,urllib.error,sys,os; "
            "request=urllib.request.Request('http://127.0.0.1:8000/'+sys.argv[1],"
            "method=sys.argv[2],headers={'X-Aura-BFF-Key':os.environ['AURA_BFF_SHARED_KEY']}); "
            "\ntry: response=urllib.request.urlopen(request,timeout=15)"
            "\nexcept urllib.error.HTTPError as error: response=error"
            "\nprint(json.dumps({'status':response.status,'body':response.read().decode()}))",
            path,
            method,
            timeout=20,
        )
        return json.loads(result.stdout)

    def begin_lock():
        process = subprocess.Popen(
            [
                *db.compose,
                "exec",
                "-T",
                db.primary,
                "sh",
                "-c",
                'exec psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        process.stdin.write(
            b"SET lock_timeout='1s'; SET statement_timeout='10s'; BEGIN; "
            b"LOCK TABLE products IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(8); ROLLBACK;\n"
        )
        process.stdin.close()

        def acquired():
            if (
                db.sql(
                    db.primary,
                    "SELECT count(*) FROM pg_locks WHERE relation='products'::regclass "
                    "AND mode='AccessExclusiveLock' AND granted;",
                )
                != "1"
            ):
                raise module.OperationError("Probe table lock not acquired")

        module.retry(acquired, 3)
        return process

    print(
        "12/14 Real GET survives a locked primary crash; uncommitted POST is not replayed",
        flush=True,
    )
    watcher_log = (db.home / "ha-test.log").open("w+")
    watcher = subprocess.Popen(
        [sys.executable, db.home.parent / "ops/database.py", "--project", db.project, "ha-watch"],
        stdout=watcher_log,
        stderr=watcher_log,
    )
    operation_lock = None
    try:
        original = db.primary
        db.dc("stop", "--timeout", "0", db.standby)
        module.retry(ha.require_sync, 20)
        assert db.primary == original
        print("PASS: replica crash restarts the replica without promoting it", flush=True)
        real_sql = db.sql
        interrupted_replica = False

        def crash_replica_during_password_commit(node, statement, **kwargs):
            nonlocal interrupted_replica
            if "ALTER ROLE aura_replicator PASSWORD" in statement and not interrupted_replica:
                interrupted_replica = True
                db.dc("stop", "--timeout", "0", db.standby)
            return real_sql(node, statement, **kwargs)

        db.sql = crash_replica_during_password_commit
        try:
            with (db.home / "operations.lock").open("a") as busy:
                fcntl.flock(busy, fcntl.LOCK_EX)
                db.set_replication_password(secrets.token_urlsafe(48))
        finally:
            db.sql = real_sql
        assert interrupted_replica
        ha.require_sync()
        print(
            "PASS: replica restart during synchronous password commit "
            "completes under the operations lock",
            flush=True,
        )
        for _cycle in range(2):
            old, target = db.primary, db.standby
            operation_lock = (db.home / "operations.lock").open("a")
            fcntl.flock(operation_lock, fcntl.LOCK_EX)
            real_wait = db.wait_api_generation
            real_finish = db.finish_rotation

            def interrupted(*args, **kwargs):
                raise SystemExit("Test interruption of credential rotation")

            if _cycle == 0:
                db.wait_api_generation = interrupted
            else:
                db.finish_rotation = interrupted
            try:
                db.rotate()
            except SystemExit:
                pass
            finally:
                db.wait_api_generation = real_wait
                db.finish_rotation = real_finish
            phase = "prepared" if _cycle == 0 else "committed"
            assert db.read("rotation.json")["phase"] == phase
            tag = secrets.token_hex(8)
            # This commit returns only after the synchronous replica has applied it.
            db.sql(old, f"INSERT INTO inflight_writes(tag) VALUES ('{tag}');")
            with ThreadPoolExecutor(max_workers=3) as executor:
                write_tag = secrets.token_hex(8)
                pending_write = executor.submit(http, "ha-write?tag=" + write_tag, "POST")

                def transaction_open(old=old, write_tag=write_tag):
                    if (
                        db.sql(
                            old,
                            "SELECT count(*) FROM pg_stat_activity WHERE "
                            f"application_name='{write_tag}' AND state='idle in transaction';",
                        )
                        != "1"
                    ):
                        raise module.OperationError("Test write transaction has not started")

                module.retry(transaction_open, 10)
                locker = begin_lock()
                pending_read = executor.submit(http, "api/v1/catalog")

                def read_blocked(old=old):
                    if (
                        db.sql(
                            old,
                            "SELECT count(*) FROM pg_stat_activity WHERE "
                            "usename IN ('aura_app_a','aura_app_b') AND wait_event_type='Lock' "
                            "AND cardinality(pg_blocking_pids(pid))>0;",
                        )
                        == "0"
                    ):
                        raise module.OperationError("HTTP GET is not blocked on the database")

                module.retry(read_blocked, 3)
                assert not pending_read.done()
                started = time.monotonic()
                if _cycle == 0:
                    db.dc("stop", "--timeout", "0", old)
                    operation_lock.close()
                    operation_lock = None
                else:
                    # A hung node is still running; the controller must fence it itself.
                    db.dc("pause", old)
                    operation_lock.close()
                    operation_lock = None

                    def switched(target=target):
                        if db.primary != target:
                            raise module.OperationError("Hung writer has not been fenced")

                    module.retry(switched, 12)
                # Release the test's application wait; its dead transaction must fail.
                release = db.home / "runtime" / f"release-{write_tag}"
                release.touch()
                read = pending_read.result(timeout=15)
                write = pending_write.result(timeout=15)
                locker.wait(timeout=10)
                release.unlink(missing_ok=True)
            assert read["status"] == 200, read
            assert write["status"] == 503, write

            def completed(target=target):
                if db.primary != target or ha.journal.exists():
                    raise module.OperationError("Automatic failover/rejoin not finished")

            module.retry(completed, 45)
            assert not db.journal.exists(), "HA did not recover the interrupted password rotation"
            assert watcher.poll() is None
            assert (
                db.sql(db.primary, f"SELECT count(*) FROM inflight_writes WHERE tag='{tag}';")
                == "1"
            )
            assert (
                db.sql(db.primary, f"SELECT count(*) FROM inflight_writes WHERE tag='{write_tag}';")
                == "0"
            )
            assert db.sql(old, "SELECT pg_is_in_recovery();") == "t"
            assert db.wait_api_generation() == workers
            ha.require_sync()
            db.verify_api()
            print(
                f"PASS: automatic {old}->{target}; held GET=200; POST=503, no partial write; "
                f"acknowledged commit preserved; recovery {time.monotonic() - started:.2f}s",
                flush=True,
            )
        print(
            "13/14 Refuse unsafe promotion; resume a durable journal in a fresh process", flush=True
        )
    finally:
        if operation_lock is not None:
            operation_lock.close()
        watcher.terminate()
        watcher.wait(timeout=10)
        watcher_log.seek(0)
        print(watcher_log.read(), flush=True)
        watcher_log.close()

    target = db.standby
    actual_stopped = ha.stopped
    ha.stopped = lambda node: False
    try:
        ha.transition()
    except ha_module.OperationError:
        pass
    else:
        raise AssertionError("Promotion proceeded without confirmed fencing")
    assert ha.journal.exists()
    assert db.sql(target, "SELECT pg_is_in_recovery();") == "t"
    rejected = db.dc("run", "--rm", "--no-deps", db.primary, check=False)
    assert rejected.returncode != 0, "Fenced writer restarted from old data"
    ha.stopped = actual_stopped
    cli("ha-check")
    assert db.primary == target and not ha.journal.exists()
    assert db.wait_api_generation() == workers
    print(
        "14/14 Password rotation, TLS renewal and backup after repeated automatic failover",
        flush=True,
    )
    cli("rotate")
    cli("renew", "--force")
    cli("maintain")
    assert db.sql(db.primary, "SELECT value FROM rotation_probe;") == "preserved"
    print(
        "PASS: repeated failover, fencing refusal, journal recovery, strict commits and live pools",
        flush=True,
    )
