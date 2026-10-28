"""Purge members whose 30-day deletion grace period has ended.

    uv run --directory apps/api python -m aura_api.infra.purge_members            # dry run
    uv run --directory apps/api python -m aura_api.infra.purge_members --execute  # purge

The default dry run only counts due members. Both modes record a member_deletion_runs row.
Each member is anonymized in its own transaction under the user row lock, so a login that
restores the account first is never half-purged. Orders and the coupons they reference are
retained; scheduling and the retention period for orders are operational decisions.
"""

import argparse
import asyncio

from sqlalchemy.engine import make_url

from aura_api.config import Settings
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.repository import AuthStorageUnavailable


async def purge_expired_members(
    repository: PostgresAuthRepository, *, execute: bool, limit: int
) -> dict:
    run_id = await repository.start_purge_run(dry_run=not execute)
    due, deleted, failed = [], 0, []
    status = "failed"
    try:
        due = await repository.due_member_ids(limit)
        if execute:
            for user_id in due:
                try:
                    deleted += await repository.purge_member(user_id)
                except AuthStorageUnavailable:
                    # The member's transaction rolled back; the next run retries it.
                    failed.append(user_id)
            await repository.prune_login_failures()
        status = "partial" if failed and deleted else "failed" if failed else "succeeded"
    finally:
        await repository.finish_purge_run(
            run_id, status=status, eligible=len(due), deleted=deleted, failed=failed
        )
    return {
        "run": str(run_id),
        "status": status,
        "eligible": len(due),
        "deleted": deleted,
        "failed": len(failed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--execute", action="store_true", help="purge instead of a dry run")
    parser.add_argument("--limit", type=int, default=500, help="members per run (default 500)")
    args = parser.parse_args()
    if args.limit < 1:
        raise SystemExit("--limit must be positive")
    settings = Settings()
    if settings.database_url is None:
        raise SystemExit("Set AURA_DATABASE_URL to purge members")
    dsn = (
        make_url(settings.database_url.get_secret_value())
        .set(drivername="postgresql")
        .render_as_string(hide_password=False)
    )
    repository = PostgresAuthRepository(dsn, settings.jwt_issuer or "")
    # psycopg's async driver needs a selector loop (the Windows default is Proactor).
    result = asyncio.run(
        purge_expired_members(repository, execute=args.execute, limit=args.limit),
        loop_factory=asyncio.SelectorEventLoop,
    )
    print(" ".join(f"{name}={value}" for name, value in result.items()))
    if result["status"] != "succeeded":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
