"""Test-only HTTP fixture for Next BFF. Never imported by the production app.

Uses the real JWT verifier, CSRF middleware and exception handlers. Issuance,
users and revocation storage below are deliberately confined to this fixture.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import jwt
from fastapi import HTTPException, Request, Response
from pydantic import BaseModel

from aura_api.config import Settings
from aura_api.core.auth import CurrentUser
from aura_api.core.authorization import require_permissions
from aura_api.core.revocation import get_token_revocation_store
from aura_api.main import create_app

settings = Settings()
app = create_app(settings)
# Fixture routes must precede production routes as more resources are implemented.
# Keep the actual middleware/state and append the production routes as fallbacks.
production_routes = app.router.routes[:]
app.router.routes.clear()
COOKIE = "aura_session"


class TestRevocations:
    def __init__(self):
        self.revoked: set[str] = set()

    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        return jti in self.revoked


revocations = TestRevocations()
app.dependency_overrides[get_token_revocation_store] = lambda: revocations


class Login(BaseModel):
    email: str
    password: str


async def claims_for(request: Request) -> dict | None:
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    if not token:
        return None
    if await app.state.jwt_verifier.verify_token(token, revocations) is None:
        raise HTTPException(401)
    return jwt.decode(
        token,
        settings.jwt_signing_key.get_secret_value(),
        algorithms=[settings.jwt_algorithm],
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
    )


def issue(response: Response, guest_id: str, member_id: str | None = None) -> None:
    now = int(datetime.now(UTC).timestamp())
    token = jwt.encode(
        {
            "sub": member_id or guest_id,
            "guestId": guest_id,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": now,
            "exp": now + 900,
            "jti": str(uuid4()),
            "permissions": ["recipes:read"] if member_id else [],
        },
        settings.jwt_signing_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    response.set_cookie(COOKIE, token, max_age=900, httponly=True, samesite="lax", path="/api/v1")


def session_data(guest_id: str, member_id: str | None = None) -> dict:
    user = (
        {
            "id": member_id,
            "name": "BFF 테스트 회원",
            "email": f"{member_id}@example.com",
            "coupon": True,
            "role": "member",
        }
        if member_id
        else None
    )
    return {"user": user, "guestId": guest_id}


@app.get("/api/v1/catalog")
async def catalog():
    path = Path(__file__).resolve().parents[4] / "apps/web/mock-server/fixtures/catalog.json"
    return json.loads(path.read_text())


@app.get("/api/v1/session")
async def session(request: Request, response: Response):
    claims = await claims_for(request)
    if claims is None:
        guest_id = str(uuid4())
        issue(response, guest_id)
        return session_data(guest_id)
    member_id = claims["sub"] if "recipes:read" in claims["permissions"] else None
    return session_data(claims["guestId"], member_id)


@app.post("/api/v1/auth/login")
async def login(data: Login, request: Request, response: Response):
    claims = await claims_for(request)
    if data.password != "bff-password123" or data.email not in {
        "member-a@example.com",
        "member-b@example.com",
    }:
        raise HTTPException(401)
    guest_id = claims["guestId"] if claims else str(uuid4())
    member_id = data.email.split("@")[0]
    issue(response, guest_id, member_id)
    return session_data(guest_id, member_id)


@app.post("/api/v1/auth/logout")
async def logout(request: Request, response: Response, user: CurrentUser):
    claims = await claims_for(request)
    revocations.revoked.add(claims["jti"])
    issue(response, claims["guestId"])
    return session_data(claims["guestId"])


@app.get("/api/v1/recipes")
async def recipes(request: Request, user: CurrentUser):
    await require_permissions("recipes:read")(user)
    expected = request.headers.get("x-session-owner")
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


app.router.routes.extend(production_routes)
