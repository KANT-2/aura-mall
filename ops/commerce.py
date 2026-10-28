#!/usr/bin/env python3
"""Install a user timer for bounded unpaid expiry and payment/refund reconciliation."""

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "run", "status"])
    action = parser.parse_args().action
    if action == "run":
        result = subprocess.run(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                "--index",
                "1",
                "api",
                "python",
                "-m",
                "aura_api.infra.commerce_maintenance",
            ],
            cwd=ROOT,
        )
        raise SystemExit(result.returncode)
    if action == "status":
        raise SystemExit(
            subprocess.run(
                ["systemctl", "--user", "status", "aura-commerce.timer", "--no-pager"]
            ).returncode
        )
    if any(char in str(ROOT) for char in ('"', "%", "\n", "\r", "\\")):
        raise SystemExit("Unsupported service path")
    directory = Path.home() / ".config/systemd/user"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "aura-commerce.service").write_text(f"""[Unit]
Description=AURA unpaid order expiry and PG reconciliation
[Service]
Type=oneshot
WorkingDirectory={ROOT}
ExecStart=/usr/bin/python3 "{ROOT}/ops/commerce.py" run
TimeoutStartSec=240
UMask=0077
""")
    (directory / "aura-commerce.timer").write_text("""[Unit]
Description=Run AURA commerce maintenance every minute
[Timer]
OnBootSec=2min
OnUnitInactiveSec=60s
Persistent=true
[Install]
WantedBy=timers.target
""")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", "aura-commerce.timer"], check=True)
    print("aura-commerce.timer enabled (60 seconds; current rotating DB credentials)")


if __name__ == "__main__":
    main()
