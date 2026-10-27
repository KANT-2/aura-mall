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
            db.sql(
                "db",
                "CREATE TABLE rotation_probe(id int PRIMARY KEY, value text); "
                "INSERT INTO rotation_probe VALUES (1, 'preserved');",
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
            cli("rotate")
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
            real_restart = db.restart_api
            calls = 0

            def fail_once():
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise module.OperationError("Injected API recreation failure")
                real_restart()

            db.restart_api = fail_once
            try:
                db.rotate()
            except module.OperationError:
                pass
            else:
                raise AssertionError("Injected failure did not happen")
            assert calls == 2 and db.url_file.read_text() == stable and not db.journal.exists()

            def interrupted():
                raise SystemExit("Injected process interruption")

            db.restart_api = interrupted
            try:
                db.rotate()
            except SystemExit:
                pass
            assert db.journal.exists()
            cli("maintain")
            assert db.url_file.read_text() == stable and not db.journal.exists()
            db.restart_api = real_restart
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
