"""Full PostgreSQL commerce browser fixture. Never imported by the production image."""

import asyncio
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from aura_api.config import Settings
from aura_api.infra.create_admin import create_first_admin
from aura_api.infra.seed import load_seed
from aura_api.main import create_app
from tests.fixtures.fake_payment_gateway import FakePaymentGateway

URL = os.environ.get("AURA_COMMERCE_TEST_DATABASE_URL", "")
url = make_url(URL)
if url.host not in {"127.0.0.1", "localhost"} or not (url.database or "").startswith(
    "aura_commerce_test"
):
    raise RuntimeError("Use a dedicated local aura_commerce_test database")
settings = Settings(database_url=URL, database_url_file=None, database_runtime_dir=None)
app = create_app(settings)
app.state.payment_gateway = FakePaymentGateway()


async def bootstrap():
    await load_seed(URL)
    # Test credentials only, on a dedicated disposable database.
    await create_first_admin(
        URL, "operator@example.test", "브라우저 운영자", "browser-admin-password-42"
    )


if __name__ == "__main__":
    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    cfg.attributes["database_url"] = URL
    command.upgrade(cfg, "head")
    asyncio.run(bootstrap())
