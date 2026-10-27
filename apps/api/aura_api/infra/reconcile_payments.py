"""Ask the PG again about payments whose result is still unknown (IN_PROGRESS).

    uv run --directory apps/api python -m aura_api.infra.reconcile_payments [--older-than 120]

Each attempt is re-sent with its original idempotency key, so the PG returns the first
result instead of charging again. Exit code 1 means some results are still unknown.
"""

import argparse
import asyncio
from datetime import timedelta

from aura_api.config import Settings
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.payment_gateway import TossPaymentsGateway
from aura_api.services.payments import reconcile_payments


async def run(settings: Settings, older_than: int, limit: int) -> dict[str, int]:
    gateway = TossPaymentsGateway(
        settings.toss_secret_key.get_secret_value(),
        settings.toss_api_url,
        settings.payment_timeout_seconds,
    )
    engine = create_engine(settings.database_url.get_secret_value())
    try:
        async with create_sessionmaker(engine)() as session:
            return await reconcile_payments(
                session, gateway, older_than=timedelta(seconds=older_than), limit=limit
            )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--older-than", type=int, default=120, help="seconds since the claim")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    if args.older_than < 0 or args.limit < 1:
        raise SystemExit("--older-than must be >= 0 and --limit positive")
    settings = Settings()
    if settings.database_url is None or settings.payment_provider != "toss":
        raise SystemExit("Set AURA_DATABASE_URL and the Toss payment settings")
    counts = asyncio.run(run(settings, args.older_than, args.limit))
    print(" ".join(f"{name}={value}" for name, value in counts.items()))
    if counts["pending"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
