from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import anyio
import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from aura_api.config import Settings
from aura_api.main import create_app

SECRETS = "password=private-password token=private-token postgres://user:db-secret@db/aura"


class PrivateInput(BaseModel):
    password: str = Field(min_length=100)


@pytest.fixture
def client():
    app = create_app(Settings(_env_file=None, csrf_allowed_origins=["http://mall.test"]))

    @app.get("/test/request-id")
    async def request_id(request: Request):
        # Yield so overlapping requests can expose accidentally shared state.
        before = request.state.request_id
        await anyio.sleep(0.01)
        return {"before": before, "after": request.state.request_id}

    @app.post("/test/validate")
    async def validate(body: PrivateInput):
        return {"ok": True}

    @app.get("/test/crash")
    async def crash():
        raise RuntimeError(SECRETS)

    @app.get("/test/http/{status}")
    async def http_error(status: int, structured: bool = False):
        detail = {"message": SECRETS} if structured else SECRETS
        raise HTTPException(
            status_code=status,
            detail=detail,
            headers={
                "WWW-Authenticate": "Bearer",
                "Retry-After": "60",
                "X-Internal-Debug": SECRETS,
            },
        )

    @app.get("/test/starlette")
    async def starlette_error():
        raise StarletteHTTPException(403, detail=SECRETS)

    @app.get("/test/invalid-response", response_model=PrivateInput)
    async def invalid_response():
        return {"password": SECRETS}

    with TestClient(
        app, raise_server_exceptions=False, headers={"Origin": "http://mall.test"}
    ) as test_client:
        yield test_client


@pytest.mark.parametrize("request_id", [str(uuid4()), str(uuid4()).upper()])
def test_valid_request_id_is_preserved_in_state_and_response(client, request_id):
    response = client.get("/test/request-id", headers={"X-Request-ID": request_id})

    assert response.status_code == 200
    assert response.headers["x-request-id"] == request_id
    assert response.json() == {"before": request_id, "after": request_id}


@pytest.mark.parametrize(
    "request_id",
    [
        None,
        "",
        "untrusted",
        "a" * 1000,
        "a" * 36,
        str(uuid4()).replace("-", ""),
        " " + str(uuid4()),
        "{" + str(uuid4()) + "}",
        "bad\r\nvalue",
    ],
)
def test_missing_or_invalid_request_id_is_replaced(client, request_id):
    headers = {} if request_id is None else {"X-Request-ID": request_id}
    response = client.get("/test/request-id", headers=headers)
    generated = response.headers["x-request-id"]

    assert response.status_code == 200
    assert str(UUID(generated)) == generated
    assert UUID(generated).version == 4
    assert generated != request_id
    assert response.json() == {"before": generated, "after": generated}


def test_duplicate_request_ids_are_replaced(client):
    request_ids = [str(uuid4()), str(uuid4())]
    response = client.get("/health", headers=[("X-Request-ID", value) for value in request_ids])
    assert response.status_code == 200
    assert UUID(response.headers["x-request-id"]).version == 4
    assert response.headers["x-request-id"] not in request_ids


@pytest.mark.parametrize("supplied", [False, True])
@pytest.mark.parametrize(
    ("method", "path", "body", "status", "code", "message"),
    [
        ("GET", "/health", None, 200, None, None),
        ("GET", "/missing", None, 404, "HTTP_404", "요청한 경로를 찾을 수 없습니다."),
        ("POST", "/health", None, 405, "HTTP_405", "지원하지 않는 요청 방식입니다."),
        (
            "POST",
            "/test/validate",
            {"password": SECRETS},
            422,
            "VALIDATION_ERROR",
            "입력 항목을 확인해 주세요.",
        ),
        ("GET", "/test/crash", None, 500, "INTERNAL_ERROR", "요청을 처리하지 못했어요."),
    ],
)
def test_status_error_shape_and_request_id(
    client, supplied, method, path, body, status, code, message
):
    request_id = str(uuid4())
    response = client.request(
        method, path, json=body, headers={"X-Request-ID": request_id} if supplied else {}
    )

    assert response.status_code == status
    assert response.headers["content-type"] == "application/json"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert len(response.headers.get_list("x-request-id")) == 1
    assert UUID(response.headers["x-request-id"])
    if supplied:
        assert response.headers["x-request-id"] == request_id
    if code:
        assert response.json() == {"error": {"code": code, "message": message}}
    assert SECRETS not in response.text
    for secret in ("private-password", "private-token", "db-secret", "postgres://"):
        assert secret not in response.text


def test_method_not_allowed_preserves_allow(client):
    response = client.post("/health")
    assert response.status_code == 405
    assert "GET" in response.headers["allow"].split(", ")


@pytest.mark.parametrize("status", [400, 401, 403, 409, 418, 422, 429, 500, 503])
@pytest.mark.parametrize("structured", [False, True])
def test_http_exceptions_hide_details_and_preserve_status_and_protocol_headers(
    client, status, structured
):
    response = client.get(f"/test/http/{status}", params={"structured": str(structured).lower()})

    assert response.status_code == status
    code = "INTERNAL_ERROR" if status >= 500 else f"HTTP_{status}"
    if status == 422:
        code = "VALIDATION_ERROR"
    assert response.json()["error"]["code"] == code
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["retry-after"] == "60"
    assert "x-internal-debug" not in response.headers
    assert "detail" not in response.json()
    for secret in ("private-password", "private-token", "db-secret", "postgres://"):
        assert secret not in response.text


def test_starlette_exception_is_also_sanitized(client):
    response = client.get("/test/starlette")
    assert response.status_code == 403
    assert response.json() == {"error": {"code": "HTTP_403", "message": "요청 권한이 없습니다."}}


def test_response_validation_failure_is_safe_server_error(client):
    response = client.get("/test/invalid-response")
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "요청을 처리하지 못했어요."}
    }
    assert UUID(response.headers["x-request-id"])


def test_concurrent_requests_keep_independent_ids(client):
    request_ids = [str(uuid4()) for _ in range(16)]

    def send(request_id):
        response = client.get("/test/request-id", headers={"X-Request-ID": request_id})
        assert response.status_code == 200
        assert response.headers["x-request-id"] == request_id
        assert response.json() == {"before": request_id, "after": request_id}

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(send, request_ids))


def test_generated_ids_are_independent(client):
    ids = [client.get("/health").headers["x-request-id"] for _ in range(10)]
    assert len(set(ids)) == 10


@pytest.mark.parametrize("request_id", [None, "invalid-request-id", str(uuid4())])
def test_500_before_request_id_middleware_is_safe(request_id):
    app = create_app(Settings(_env_file=None))

    # Registered last so this middleware runs before RequestIDMiddleware.
    @app.middleware("http")
    async def fail_before_request_id(request: Request, call_next):
        raise RuntimeError(SECRETS)

    headers = {} if request_id is None else {"X-Request-ID": request_id}
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/health", headers=headers)

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "요청을 처리하지 못했어요."}
    }
    actual_id = response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert UUID(actual_id)
    if request_id and request_id != "invalid-request-id":
        assert actual_id == request_id
    else:
        assert UUID(actual_id).version == 4
    for secret in ("private-password", "private-token", "db-secret", "postgres://"):
        assert secret not in response.text
