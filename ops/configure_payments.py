"""Install a Toss test-key pair from private JSON stdin; never print either key."""

import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def atomic(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".payment-pending-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def configure(root, values):
    secret = values.get("AURA_TOSS_SECRET_KEY", "")
    client = values.get("NEXT_PUBLIC_TOSS_CLIENT_KEY", "")
    if not isinstance(secret, str) or not re.fullmatch(r"test_g?sk_[A-Za-z0-9_-]{8,200}", secret):
        raise ValueError("A valid Toss test secret key is required")
    if not isinstance(client, str) or not re.fullmatch(r"test_g?ck_[A-Za-z0-9_-]{8,200}", client):
        raise ValueError("A valid Toss test client key is required")
    environment = root / ".env"
    lines = environment.read_text().splitlines()
    public = "NEXT_PUBLIC_TOSS_CLIENT_KEY=" + client
    found = False
    updated = []
    for line in lines:
        if line.startswith("NEXT_PUBLIC_TOSS_CLIENT_KEY="):
            if not found:
                updated.append(public)
            found = True
        else:
            updated.append(line)
    if not found:
        updated.append(public)
    atomic(
        root / ".env.payments", "AURA_PAYMENT_PROVIDER=toss\nAURA_TOSS_SECRET_KEY=" + secret + "\n"
    )
    atomic(environment, "\n".join(updated) + "\n")


def main():
    os.umask(0o077)
    try:
        configure(ROOT, json.load(sys.stdin))
    except (ValueError, OSError, AttributeError):
        raise SystemExit("Cannot install a valid test payment configuration") from None
    print("Toss test payments configured; secret retained in the API-only environment file")


if __name__ == "__main__":
    main()
