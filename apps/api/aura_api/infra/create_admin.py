"""Create the first admin account. Later admins are added by a signed-in admin (POST /admin/admins).

    AURA_ADMIN_PASSWORD=... uv run --directory apps/api python -m aura_api.infra.create_admin \
        --email admin@aura.com --name 운영자

Without AURA_ADMIN_PASSWORD the password is asked for (not echoed). Refuses to run when an
admin already exists, so it cannot be used to add accounts behind the API's back.
"""

import argparse
import asyncio
import getpass
import os

from aura_api.config import Settings
from aura_api.domain.identity import validate_registration
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.repositories import admin as repository


async def create_first_admin(database_url: str, email: str, name: str, password: str) -> str:
    data = validate_registration(name, email, password)
    password_hash = PASSWORD_HASHER.hash(data.password)
    engine = create_engine(database_url)
    try:
        async with create_sessionmaker(engine)() as session, session.begin():
            if await repository.admin_count(session) > 0:
                raise SystemExit("An admin already exists; add more admins through the API")
            admin = await repository.add_admin(
                session,
                email=data.email,
                name=data.name,
                password_hash=password_hash,
                created_by=None,
            )
            return data.email if admin else ""
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    settings = Settings()
    if settings.database_url is None:
        raise SystemExit("Set AURA_DATABASE_URL to create an admin")
    password = os.environ.get("AURA_ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    email = asyncio.run(
        create_first_admin(
            settings.database_url.get_secret_value(), args.email, args.name, password
        )
    )
    print(f"created admin {email}")


if __name__ == "__main__":
    main()
