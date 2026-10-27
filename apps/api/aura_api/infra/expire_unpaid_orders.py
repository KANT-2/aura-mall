"""Cancel unpaid orders past the configured time and give back their stock and coupons.

    uv run --directory apps/api python -m aura_api.infra.expire_unpaid_orders            # dry run
    uv run --directory apps/api python -m aura_api.infra.expire_unpaid_orders --execute  # cancel

The time limit comes from AURA_UNPAID_ORDER_TTL_MINUTES (or --ttl-minutes); without one the job
refuses to run, because the operating value is a policy decision. Orders whose payment is in
progress or approved are skipped: run aura_api.infra.reconcile_payments first.
"""

import argparse
import asyncio
from datetime import timedelta

from aura_api.config import Settings
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.services.orders import expire_unpaid_orders


async def run(database_url: str, ttl_minutes: int, limit: int, execute: bool) -> dict[str, int]:
    engine = create_engine(database_url)
    try:
        async with create_sessionmaker(engine)() as session:
            return await expire_unpaid_orders(
                session, older_than=timedelta(minutes=ttl_minutes), limit=limit, execute=execute
            )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--execute", action="store_true", help="cancel instead of a dry run")
    parser.add_argument("--ttl-minutes", type=int, help="overrides AURA_UNPAID_ORDER_TTL_MINUTES")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    settings = Settings()
    ttl = args.ttl_minutes or settings.unpaid_order_ttl_minutes
    if ttl is None or ttl < 1 or args.limit < 1:
        raise SystemExit(
            "Set AURA_UNPAID_ORDER_TTL_MINUTES (or --ttl-minutes) and a positive limit"
        )
    if settings.database_url is None:
        raise SystemExit("Set AURA_DATABASE_URL to expire orders")
    counts = asyncio.run(
        run(settings.database_url.get_secret_value(), ttl, args.limit, args.execute)
    )
    print(
        f"ttl_minutes={ttl} dry_run={not args.execute} "
        + " ".join(f"{name}={value}" for name, value in counts.items())
    )


if __name__ == "__main__":
    main()
