"""HTTP fixture: production JWT auth API/service/verifier; only storage is replaced."""

import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from auth_storage import MemoryAuthRepository
from fastapi import HTTPException, Request

from aura_api.config import Settings
from aura_api.core.auth import require_authenticated_user
from aura_api.identity.service import PASSWORD_HASHER, AuthLifecycleService
from aura_api.identity.tokens import UserRecord
from aura_api.main import create_app

settings = Settings(database_url=None)
app = create_app(settings)
production_routes = app.router.routes[:]
app.router.routes.clear()
repository = MemoryAuthRepository(settings.jwt_issuer)
for name in ("member-a", "member-b"):
    user_id = uuid5(NAMESPACE_URL, name)
    repository.users[f"{name}@example.com"] = UserRecord(
        user_id, PASSWORD_HASHER.hash("bff-password123"), True
    )
app.state.auth_repository = repository
app.state.auth_service = AuthLifecycleService(settings, repository)


@app.get("/api/v1/catalog")
async def catalog():
    path = Path(__file__).resolve().parents[4] / "apps/web/mock-server/fixtures/catalog.json"
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/v1/recipes")
async def recipes(request: Request):
    if not request.headers.get("authorization"):
        return []
    user = await require_authenticated_user(request, app.state.jwt_verifier, repository)
    expected = request.headers.get("x-account-owner")
    if expected and expected != user.user_id:
        raise HTTPException(409)
    return [
        {
            "id": f"recipe-{user.user_id}",
            "version": 1,
            "name": "전송 검증용 레시피",
            "label": "paper",
            "counts": {"bergamot": 3},
            "color": "#e8d36b",
            "created": "2026-10-26T00:00:00Z",
        }
    ]


# Keep the production auth routes; only catalog/recipe resource storage is replaced.
app.router.routes.extend(production_routes)
