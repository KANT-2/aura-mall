"""Exercise the SSH deployment shell with disposable fake Git/Docker commands."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
COMMIT = "a" * 40

STUB = r"""
import json
import os
import sys
from pathlib import Path

name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["AURA_CD_TEST_LOG"], "a") as log:
    log.write(name + " " + " ".join(args) + "\n")
if name == "git":
    if "rev-parse" in args:
        print(os.environ["AURA_CD_TEST_ACTUAL_COMMIT"])
elif name == "docker":
    if "config" in args and "json" in args:
        print(json.dumps({"networks":{"caddy":{"name":"test-edge"}},
                          "services":{"api":{"deploy":{"replicas":2}},
                                      "web":{"deploy":{"replicas":2}}}}))
    elif "compose" in args and "exec" in args:
        if any("pg_isready" in arg for arg in args):
            # Docker's stdin attachment consumed the rest of the original SSH script.
            consumed = sys.stdin.read()
            with open(os.environ["AURA_CD_TEST_LOG"], "a") as log:
                log.write("stdin-consumed=" + str(len(consumed)) + "\n")
        elif any("pg_dump" in arg for arg in args):
            sys.stdout.buffer.write(b"test-backup")
        elif "pg_restore" in args:
            assert sys.stdin.buffer.read() == b"test-backup"
    elif "compose" in args and "ps" in args:
        service = args[-1]
        print(service + "-one\n" + service + "-two")
"""


class DeploymentShellTests(unittest.TestCase):
    def run_deployment(self, *, managed=False, ha=False, actual_commit=COMMIT):
        workflow = (SOURCE / ".github/workflows/cd.yml").read_text()
        remote = textwrap.dedent(
            workflow.split("<<'REMOTE'\n", 1)[1].rsplit("\n          REMOTE", 1)[0]
        )
        with tempfile.TemporaryDirectory(prefix="aura-cd-shell-test-") as temporary:
            root = Path(temporary)
            binaries = root / "bin"
            binaries.mkdir()
            for name in ("git", "docker", "curl"):
                program = binaries / name
                program.write_text("#!" + sys.executable + "\n" + STUB)
                program.chmod(0o700)
            for name in ("compose.yaml", "compose.lb.yaml", ".env"):
                (root / name).touch()
            (root / "ops").mkdir(exist_ok=True)
            (root / "ops/commerce.py").write_text(
                "import os\n"
                "with open(os.environ['AURA_CD_TEST_LOG'],'a') as log:\n"
                " log.write('operation:commerce-install\\n')\n"
            )
            if managed:
                secret = root / ".db-ops/client/database-url"
                secret.parent.mkdir(parents=True)
                secret.touch()
                (root / "ops").mkdir(exist_ok=True)
                (root / "ops/database.py").write_text(
                    "import os,sys\n"
                    "with open(os.environ['AURA_CD_TEST_LOG'],'a') as log:\n"
                    " log.write('operation:' + sys.argv[1] + '\\n')\n"
                )
                if ha:
                    state = root / ".db-ops/state"
                    state.mkdir()
                    (state / "ha.json").write_text('{"enabled": true}\n')
            # Keep the shell's backup writes inside this temporary directory.
            remote = remote.replace("$HOME/workspace/aura-backups", "${AURA_CD_TEST_BACKUP_DIR}")
            self.assertNotIn("$HOME", remote)
            self.assertNotIn("${HOME}", remote)
            log = root / "calls.log"
            result = subprocess.run(
                ["bash", "-se", "--", str(root), "main", COMMIT],
                input=remote,
                text=True,
                capture_output=True,
                env={
                    **os.environ,
                    "PATH": str(binaries) + os.pathsep + os.environ["PATH"],
                    "AURA_CD_TEST_LOG": str(log),
                    "AURA_CD_TEST_ACTUAL_COMMIT": actual_commit,
                    "AURA_CD_TEST_BACKUP_DIR": str(root / "backups"),
                },
                timeout=30,
            )
            if result.returncode == 0 and not managed:
                backups = list((root / "backups").glob("aura-*.dump"))
                self.assertEqual(len(backups), 1)
                self.assertEqual(backups[0].read_bytes(), b"test-backup")
            return result, log.read_text()

    def test_stdin_consumer_cannot_skip_the_deployment(self):
        result, calls = self.run_deployment()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("stdin-consumed=0", calls)
        self.assertIn("build api web", calls)
        self.assertIn("alembic upgrade head", calls)
        self.assertIn("curl -fsS", calls)
        self.assertIn("AURA HA deployment completed", result.stdout)

    def test_managed_database_uses_the_admin_migration_operation(self):
        result, calls = self.run_deployment(managed=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("operation:migrate", calls)
        self.assertNotIn("alembic upgrade head", calls)
        self.assertIn("AURA HA deployment completed", result.stdout)

    def test_a_different_commit_fails_before_any_database_change(self):
        result, calls = self.run_deployment(actual_commit="b" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("docker", calls)
        self.assertNotIn("AURA HA deployment completed", result.stdout)

    def test_managed_ha_updates_its_controller_after_deployment(self):
        result, calls = self.run_deployment(managed=True, ha=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("operation:ha-install", calls)
        self.assertIn("AURA HA deployment completed", result.stdout)


if __name__ == "__main__":
    unittest.main()
