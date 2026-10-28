"""One bounded commerce maintenance pass; resolve the current DB URL on every invocation."""

import asyncio
from datetime import timedelta

from aura_api.config import Settings
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.payment_gateway import TossPaymentsGateway
from aura_api.services.orders import expire_unpaid_orders
from aura_api.services.payments import reconcile_payments
from aura_api.services.refunds import reconcile_refunds


async def run(settings: Settings):
    url = (
        settings.database_url_file.read_text().strip()
        if settings.database_url_file
        else settings.database_url.get_secret_value()
    )
    engine = create_engine(url)
    counts = {}
    try:
        factory = create_sessionmaker(engine)
        if settings.payment_provider == "toss":
            gateway = TossPaymentsGateway(
                settings.toss_secret_key.get_secret_value(),
                settings.toss_api_url,
                settings.payment_timeout_seconds,
            )
            async with factory() as session:
                counts["payments"] = await reconcile_payments(
                    session, gateway, older_than=timedelta(minutes=2), limit=100
                )
            async with factory() as session:
                counts["refunds"] = await reconcile_refunds(
                    session, gateway, older_than=timedelta(minutes=2), limit=100
                )
        if settings.unpaid_order_ttl_minutes is not None:
            async with factory() as session:
                counts["orders"] = await expire_unpaid_orders(
                    session,
                    older_than=timedelta(minutes=settings.unpaid_order_ttl_minutes),
                    limit=100,
                    execute=True,
                )
        return counts
    finally:
        await engine.dispose()


def main():
    import json
    import sys

    try:
        counts = asyncio.run(run(Settings()))
    except Exception:
        # Database URLs, PG credentials and customer data never appear in the journal.
        print("Commerce maintenance failed; retry on next timer tick", file=sys.stderr)
        raise SystemExit(1) from None
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
