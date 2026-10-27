#!/usr/bin/env python3
"""Destructive ONLY to its own temporary Compose project; never uses production .env/volumes.

Run with Docker access: python3 ops/test_database.py
"""

import importlib.util
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


def main():
    project = "aura-db-test-" + secrets.token_hex(4)
    with tempfile.TemporaryDirectory(prefix=project + "-") as temporary:
        root = Path(temporary)
        for name in ("compose.yaml", "compose.database.yaml"):
            shutil.copy2(SOURCE / name, root / name)
        shutil.copytree(SOURCE / "ops", root / "ops", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(
            SOURCE / "apps/api",
            root / "apps/api",
            ignore=shutil.ignore_patterns(
                ".venv", "__pycache__", ".pytest_cache", ".ruff_cache", ".env"
            ),
        )
        shutil.copy2(
            SOURCE / "apps/api/tests/fixtures/rotation_app.py",
            root / "apps/api/aura_api/_rotation_test_app.py",
        )
        # Two real app workers must both observe the URL update, without a process restart.
        overlay = root / "compose.database.yaml"
        overlay.write_text(
            overlay.read_text().replace(
                "  api:\n",
                "  api:\n    command: [uvicorn, aura_api._rotation_test_app:app, --host, "
                "0.0.0.0, --port, '8000', --workers, '2']\n",
            )
        )
        (root / ".env").write_text(
            "\n".join(
                [
                    "POSTGRES_DB=aura",
                    "POSTGRES_USER=aura_admin",
                    "POSTGRES_PASSWORD=" + secrets.token_urlsafe(48),
                    "AURA_BFF_SHARED_KEY=" + secrets.token_urlsafe(48),
                    "AURA_JWT_SIGNING_KEY=" + secrets.token_urlsafe(48),
                    "AURA_JWT_ISSUER=aura-test",
                    "AURA_JWT_AUDIENCE=aura-test",
                    "APP_ORIGIN=http://localhost:13000",
                    f"AURA_DOCKER_SUBNET=10.251.{secrets.randbelow(240) + 10}.0/24",
                    "",
                ]
            )
        )
        (root / ".env").chmod(0o600)
        spec = importlib.util.spec_from_file_location("aura_database_ops", root / "ops/database.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        os.umask(0o077)
        db = module.Database(project)

        def cli(*args, check=True):
            result = subprocess.run(
                [sys.executable, root / "ops/database.py", "--project", project, *args],
                capture_output=True,
                text=True,
                timeout=900,
            )
            if check and result.returncode:
                raise AssertionError(f"Operation {args[0]} failed: {result.stderr.strip()}")
            return result

        try:
            print(
                "1/10 Bootstrap isolated primary, verified TLS, standby and API",
                flush=True,
            )
            cli("init")
            ca = (db.client / "ca.crt").read_bytes()
            cli("init")
            assert (db.client / "ca.crt").read_bytes() == ca
            cli("bootstrap")
            cli("migrate")
            assert db.sql("db", "SELECT count(*) FROM alembic_version;") == "1"
            assert db.sql("db", "SELECT count(*) FROM users;") == "0"
            print("PASS: verified TLS administrator migrations; no accounts seeded", flush=True)
            db.sql(
                "db",
                "CREATE TABLE rotation_probe(id int PRIMARY KEY, value text); "
                "INSERT INTO rotation_probe VALUES (1, 'preserved'); "
                "CREATE TABLE inflight_writes(tag text PRIMARY KEY); "
                "CREATE TABLE inflight_auth_writes(tag text PRIMARY KEY); "
                "CREATE TABLE rotation_lock(id int PRIMARY KEY, value int NOT NULL); "
                "INSERT INTO rotation_lock VALUES (1, 0);",
            )
            db.wait_replica()
            assert db.sql("db-standby", "SELECT value FROM rotation_probe;") == "preserved"
            db.dc(
                "exec",
                "-T",
                "api",
                "python",
                "-c",
                """
import asyncio
import asyncpg
from aura_api.config import Settings
async def main():
    con = await asyncpg.connect(Settings().database_url.get_secret_value())
    assert await con.fetchval('SELECT value FROM rotation_probe') == 'preserved'
    assert not await con.fetchval('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')
    try:
        await con.execute('CREATE TABLE forbidden_ddl(id int)')
    except asyncpg.InsufficientPrivilegeError:
        pass
    else:
        raise AssertionError('Runtime role can perform DDL')
    await con.close()
asyncio.run(main())
""",
            )

            print("2/10 Reject plaintext, wrong hostname and untrusted CA", flush=True)
            for dsn in [
                "host=db user=aura_app_a dbname=aura sslmode=disable",
                "host=wrong.example hostaddr=127.0.0.1 user=aura_app_a dbname=aura "
                "sslmode=verify-full sslrootcert=/run/aura-ca.crt",
                "host=db user=aura_app_a dbname=aura sslmode=verify-full "
                "sslrootcert=/etc/ssl/certs/ca-certificates.crt",
            ]:
                result = db.dc("exec", "-T", "db", "psql", dsn, "-c", "SELECT 1;", check=False)
                assert result.returncode != 0

            print(
                "3/10 Renew certificate and private key; verify served serials on both nodes",
                flush=True,
            )
            serial = db.serial(certificate=db.server / "current/server.crt")
            key = (db.server / "current/server.key").read_bytes()
            cli("renew", "--force")
            assert db.serial(certificate=db.server / "current/server.crt") != serial
            assert (db.server / "current/server.key").read_bytes() != key
            assert (db.client / "ca.crt").read_bytes() == ca
            db.verify_api()
            stable_serial = db.serial(certificate=db.server / "current/server.crt")
            real_install = db.install_certificates
            installs = 0

            def reject_new_certificate_once():
                nonlocal installs
                installs += 1
                if installs == 1:
                    raise module.OperationError("Injected certificate installation failure")
                real_install()

            db.install_certificates = reject_new_certificate_once
            try:
                db.renew(force=True)
            except module.OperationError:
                pass
            else:
                raise AssertionError("Injected certificate failure did not happen")
            assert installs == 2
            assert db.serial(certificate=db.server / "current/server.crt") == stable_serial
            db.install_certificates = real_install

            print(
                "4/10 Rotate application and replication passwords, revoke the old login",
                flush=True,
            )
            old_url = db.url_file.read_text().strip()
            old_replication = db.replication_password()
            identity = db.wait_api_generation()
            assert all(len(value["processes"]) == 2 for value in identity.values())
            tag = secrets.token_hex(8)
            waiting_tag = secrets.token_hex(8)

            def http(path):
                result = db.dc(
                    "exec",
                    "-T",
                    "api",
                    "python",
                    "-c",
                    "import json,sys,urllib.request; "
                    "print(urllib.request.urlopen('http://127.0.0.1:8000/' + "
                    "sys.argv[1], timeout=100).read().decode())",
                    path,
                    timeout=110,
                )
                return json.loads(result.stdout)

            with ThreadPoolExecutor(max_workers=3) as executor:
                pending_request = executor.submit(http, "rotation-inflight?tag=" + tag)

                def old_transactions_started():
                    if (
                        db.sql(
                            "db",
                            "SELECT count(*) FROM pg_stat_activity WHERE "
                            f"application_name='{tag}' AND usename='aura_app_a';",
                        )
                        != "2"
                    ):
                        raise module.OperationError("In-flight request has not opened both drivers")

                module.retry(old_transactions_started, 30)
                assert db.sql("db", "SELECT count(*) FROM inflight_writes;") == "0"
                waiting_request = executor.submit(http, "rotation-locked?tag=" + waiting_tag)

                def row_lock_is_waiting():
                    blocked = db.sql(
                        "db",
                        "SELECT count(*) FROM pg_stat_activity waiting WHERE "
                        f"waiting.application_name='{waiting_tag}' "
                        "AND waiting.usename='aura_app_a' AND waiting.wait_event_type='Lock' "
                        "AND EXISTS (SELECT FROM pg_stat_activity holder WHERE "
                        "holder.pid=ANY(pg_blocking_pids(waiting.pid)) "
                        f"AND holder.application_name='{tag}' AND holder.usename='aura_app_a');",
                    )
                    if blocked != "1":
                        raise module.OperationError(
                            "The second request is not waiting on the first row lock"
                        )

                module.retry(row_lock_is_waiting, 30)
                rotation = executor.submit(db.rotate)

                def new_requests_use_new_credentials():
                    result = http("rotation-probe")
                    if result != {"orm_user": "aura_app_b", "auth_user": "aura_app_b"}:
                        raise module.OperationError("New request has not switched credentials")

                try:
                    module.retry(new_requests_use_new_credentials, 45)
                    assert not rotation.done(), "Rotation revoked a login with a live request"
                    assert not pending_request.done(), "Original request did not stay in progress"
                    assert not waiting_request.done(), "Row-lock waiter did not stay in progress"
                    row_lock_is_waiting()
                    assert db.sql("db", "SELECT value FROM rotation_lock WHERE id=1;") == "0"
                    assert (
                        db.sql("db", "SELECT rolcanlogin FROM pg_roles WHERE rolname='aura_app_a';")
                        == "t"
                    )
                    assert (
                        db.sql(
                            "db",
                            "SELECT count(*) FROM pg_stat_activity WHERE "
                            f"application_name='{tag}' AND usename='aura_app_a';",
                        )
                        == "2"
                    )
                    for _ in range(6):
                        new_requests_use_new_credentials()
                finally:
                    db.dc(
                        "exec",
                        "-T",
                        "api",
                        "python",
                        "-c",
                        "from pathlib import Path; import sys; "
                        "Path('/run/aura-db-runtime/release-' + sys.argv[1]).touch()",
                        tag,
                    )
                response = pending_request.result(timeout=30)
                assert response == {
                    "orm_user": "aura_app_a",
                    "auth_user": "aura_app_a",
                    "committed": True,
                }
                assert waiting_request.result(timeout=30) == {
                    "orm_user": "aura_app_a",
                    "committed": True,
                }
                rotation.result(timeout=60)
            assert db.wait_api_generation() == identity, "A container or app worker restarted"
            for table in ("inflight_writes", "inflight_auth_writes"):
                assert db.sql("db", f"SELECT count(*) FROM {table} WHERE tag='{tag}';") == "1"
            assert (
                db.sql("db", f"SELECT count(*) FROM inflight_writes WHERE tag='{waiting_tag}';")
                == "1"
            )
            assert db.sql("db", "SELECT value FROM rotation_lock WHERE id=1;") == "2"
            print(
                "PASS: request running during rotation returned 200 and both writes committed "
                "exactly once; new requests used new credentials; both worker identities unchanged",
                flush=True,
            )
            print(
                "PASS: a second HTTP write was blocked on the first request's PostgreSQL "
                "row lock during rotation; both requests returned 200 after unlock; "
                "each write committed once; the row counter advanced exactly twice",
                flush=True,
            )
            assert db.url_file.read_text().strip() != old_url
            assert db.replication_password() != old_replication
            assert (
                db.sql("db", "SELECT rolcanlogin FROM pg_roles WHERE rolname='aura_app_a';") == "f"
            )
            db.dc(
                "exec",
                "-T",
                "api",
                "python",
                "-c",
                """
import asyncio, sys, asyncpg
async def main():
    try:
        await asyncpg.connect(sys.stdin.read().strip())
    except asyncpg.InvalidAuthorizationSpecificationError:
        return
    raise AssertionError('Old login is still accepted')
asyncio.run(main())
""",
                data=old_url,
            )

            print("5/10 Recover failed and interrupted password cutovers", flush=True)
            stable = db.url_file.read_text()
            real_wait = db.wait_api_generation
            calls = 0

            def fail_once(*args, **kwargs):
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise module.OperationError("Injected worker acknowledgement failure")
                return real_wait(*args, **kwargs)

            db.wait_api_generation = fail_once
            try:
                db.rotate()
            except module.OperationError:
                pass
            else:
                raise AssertionError("Injected failure did not happen")
            assert calls == 2 and db.url_file.read_text() == stable and not db.journal.exists()

            def interrupted(*args, **kwargs):
                raise SystemExit("Injected process interruption")

            db.wait_api_generation = interrupted
            try:
                db.rotate()
            except SystemExit:
                pass
            assert db.journal.exists()
            cli("maintain")
            assert db.url_file.read_text() == stable and not db.journal.exists()
            db.wait_api_generation = real_wait
            real_finish = db.finish_rotation
            db.finish_rotation = lambda record: interrupted()
            try:
                db.rotate()
            except SystemExit:
                pass
            assert json.loads(db.journal.read_text())["phase"] == "committed"
            cli("maintain")
            assert not db.journal.exists()
            db.finish_rotation = real_finish

            print("6/10 Restore logical backup into an isolated database", flush=True)
            cli("backup")
            backup = sorted((db.home / "backups").glob("*.dump"))[-1]
            db.sql("db", "CREATE DATABASE aura_restore;")
            db.dc(
                "exec",
                "-T",
                "db",
                "sh",
                "-c",
                'exec pg_restore -U "$POSTGRES_USER" -d aura_restore --exit-on-error',
                data=backup.read_bytes(),
            )
            restored = db.dc(
                "exec",
                "-T",
                "db",
                "sh",
                "-c",
                'exec psql -XAt -U "$POSTGRES_USER" -d aura_restore '
                "-c 'SELECT value FROM rotation_probe;'",
            ).stdout.strip()
            assert restored == b"preserved"
            assert list((db.home / "backups").glob("*.globals.sql"))

            print("7/10 Standby restart keeps the existing physical copy", flush=True)
            db.dc("restart", "db-standby")
            db.wait_replica()
            cli("status")

            print(
                "8/10 Promote standby, retain data, fence the former primary across restarts",
                flush=True,
            )
            cli("promote")
            assert db.primary == "db-standby"
            assert db.sql("db-standby", "SELECT value FROM rotation_probe;") == "preserved"
            assert not db.running("db")
            fenced = db.dc("run", "--rm", "--no-deps", "db", check=False)
            assert fenced.returncode != 0
            db.verify_api()
            cli("backup")

            print(
                "9/10 Maintenance reports degraded replication after promotion",
                flush=True,
            )
            assert cli("maintain", check=False).returncode != 0
            print("10/10 Rejoin the old primary; rotate and maintain after recovery", flush=True)
            db.rejoin()
            assert db.sql("db", "SELECT pg_is_in_recovery();") == "t"
            assert db.sql("db", "SELECT value FROM rotation_probe;") == "preserved"
            cli("rotate")
            cli("maintain")
            print(
                "PASS: TLS, rotation recovery, replication, restore and promotion",
                flush=True,
            )
        except BaseException as error:
            # Logs are useful in CI; mask all generated secrets before displaying them.
            logs = db.dc(
                "logs",
                "--no-color",
                "--tail",
                "25",
                "db",
                "db-standby",
                "api",
                check=False,
            ).stdout.decode(errors="replace")
            logs += getattr(error, "diagnostics", b"").decode(errors="replace")
            sensitive = []
            for path in [
                root / ".env",
                db.url_file,
                db.home / "replication/pgpass",
                db.journal,
            ]:
                if path.exists():
                    sensitive.extend(path.read_text().splitlines())
            for item in sensitive:
                if "=" in item:
                    item = item.split("=", 1)[1]
                if len(item) > 10:
                    logs = logs.replace(item, "[redacted]")
            print(logs, file=sys.stderr)
            raise
        finally:
            db.dc("down", "--volumes", "--remove-orphans", check=False, timeout=120)


if __name__ == "__main__":
    main()
