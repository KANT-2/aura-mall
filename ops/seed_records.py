#!/usr/bin/env python3
"""Add member, recipe, inquiry and order records without overwriting existing rows."""

import argparse
import getpass
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()
    command = ["docker", "compose", "exec", "-T"]
    environment = os.environ.copy()
    if args.execute:
        password = (
            sys.stdin.readline(4096).rstrip("\r\n")
            if args.password_stdin
            else os.environ.get("AURA_RECORDS_PASSWORD") or getpass.getpass("Member password: ")
        )
        if not 12 <= len(password) <= 256:
            raise SystemExit("Use a 12–256 character member password")
        environment["AURA_RECORDS_PASSWORD"] = password
        command += ["-e", "AURA_RECORDS_PASSWORD"]
        if (ROOT / ".db-ops/client/database-url").exists():
            subprocess.run(
                [sys.executable, str(ROOT / "ops/database.py"), "backup"],
                check=True,
                cwd=ROOT,
                stdin=subprocess.DEVNULL,
            )
    command += ["api", "python", "-m", "aura_api.infra.seed_records"]
    if args.execute:
        command += ["--execute"]
    raise SystemExit(
        subprocess.run(command, cwd=ROOT, env=environment, stdin=subprocess.DEVNULL).returncode
    )


if __name__ == "__main__":
    main()
