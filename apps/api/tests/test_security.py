from uuid import UUID, uuid4

import pytest
from fastapi import Request
from fastapi.responses import HTMLResponse
from fastapi.testclient import TestClient
from pydantic import ValidationError

from aura_api.config import Settings
from aura_api.core.security import JSON_CSP, escape_html_text, validate_public_url
from aura_api.main import create_app

ORIGIN = "https://mall.test"
KEY = "test-only-server-key-0123456789abcdef"


@pytest.fixture
def app():
    app = create_app(Settings(_env_file=None, csrf_allowed_origins=[ORIGIN], bff_shared_key=KEY))

    @app.api_route("/test/echo", methods=["POST", "PUT", "PATCH", "DELETE"])
    async def echo(request: Request):
        return await request.json()

    @app.get("/test/html", response_class=HTMLResponse)
    async def html(text: str):
        return HTMLResponse(f"<p>{escape_html_text(text)}</p>")

    @app.get("/test/crash")
    async def crash():
        raise RuntimeError("private-password private-token postgres://private")

    return app


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
def test_safe_methods_are_not_blocked_by_csrf(client, method):
    response = client.request(method, "/health", headers={"Origin": "https://evil.test"})
    assert response.status_code in {200, 405}
    assert UUID(response.headers["x-request-id"])


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
@pytest.mark.parametrize(
    "headers",
    [
        {"Origin": ORIGIN},
        {"Origin": "https://MALL.test:443", "Sec-Fetch-Site": "same-origin"},
        {"Referer": ORIGIN + "/account?tab=profile"},
        {"Origin": ORIGIN, "Referer": ORIGIN + "/account", "Sec-Fetch-Site": "same-site"},
        {"X-Aura-BFF-Key": KEY, "Cookie": "aura_session=opaque"},
    ],
)
def test_trusted_mutations_keep_contract_and_request_id(client, method, headers):
    request_id = str(uuid4())
    payload = {"name": "예진", "quantity": 2}
    response = client.request(
        method, "/test/echo", json=payload, headers={**headers, "X-Request-ID": request_id}
    )
    assert response.status_code == 200
    assert response.json() == payload
    assert response.headers["x-request-id"] == request_id
    assert KEY not in response.text
    assert "x-aura-bff-key" not in response.headers


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Cookie": "aura_session=opaque"},
        {"Sec-Fetch-Site": "same-origin"},
        {"Origin": "null"},
        {"Origin": ""},
        {"Origin": "https://evil.test"},
        {"Origin": "https://mall.test.evil.test"},
        {"Origin": "https://mall.test@evil.test"},
        {"Origin": "https://mall.test/"},
        {"Origin": "https://mall.test?"},
        {"Origin": "https://mall.test https://evil.test"},
        {"Origin": "https://mall.test, https://evil.test"},
        {"Origin": "https://mall.test:99999"},
        {"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"},
        {"Origin": ORIGIN, "Sec-Fetch-Site": "same-origin, cross-site"},
        {"Origin": ORIGIN, "Sec-Fetch-Site": "invalid"},
        {"Origin": ORIGIN, "Referer": "https://evil.test/form"},
        {"Referer": "https://evil.test/form"},
        {"Referer": "null"},
        {"Referer": "/local-only"},
        {"Referer": "https://mall.test\\@evil.test"},
        {"Host": "mall.test", "X-Forwarded-Host": "mall.test", "X-Forwarded-Proto": "https"},
        {"Origin": "https://evil.test", "Host": "evil.test", "X-Forwarded-Host": "evil.test"},
        {"X-Aura-BFF-Key": "wrong-server-key-0123456789abcdef"},
        {"X-Aura-BFF-Key": KEY, "Origin": "null"},
        {"X-Aura-BFF-Key": KEY, "Sec-Fetch-Site": "cross-site"},
        {"X-Aura-BFF-Key": KEY, "Sec-Fetch-Site": "same-origin"},
        [("Origin", ORIGIN), ("Origin", ORIGIN)],
        [("Referer", ORIGIN + "/a"), ("Referer", ORIGIN + "/b")],
        [("Origin", ORIGIN), ("Sec-Fetch-Site", "same-origin"), ("Sec-Fetch-Site", "cross-site")],
        [("X-Aura-BFF-Key", KEY), ("X-Aura-BFF-Key", KEY)],
    ],
)
def test_unsafe_or_missing_sources_are_blocked(client, headers):
    request_id = str(uuid4())
    headers = list(headers.items()) if isinstance(headers, dict) else headers
    response = client.post(
        "/test/echo",
        json={"private": "unexposed"},
        headers=[*headers, ("X-Request-ID", request_id)],
    )
    assert response.status_code == 403
    assert response.json() == {"error": {"code": "HTTP_403", "message": "요청 권한이 없습니다."}}
    assert response.headers["x-request-id"] == request_id
    assert response.headers["cache-control"] == "private, no-store"
    assert KEY not in response.text


def test_unconfigured_secret_cannot_enable_originless_calls():
    app = create_app(Settings(_env_file=None, csrf_allowed_origins=[], bff_shared_key=None))
    with TestClient(app) as client:
        assert client.post("/health", headers={"X-Aura-BFF-Key": KEY}).status_code == 403
        assert client.post("/health", headers={"Origin": ORIGIN}).status_code == 403


@pytest.mark.parametrize("path,status", [("/health", 200), ("/missing", 404), ("/test/crash", 500)])
def test_security_headers_cover_normal_and_error_responses(client, path, status):
    response = client.get(path)
    assert response.status_code == status
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"] == JSON_CSP
    assert set(response.headers["vary"].lower().split(", ")) >= {
        "origin",
        "referer",
        "sec-fetch-site",
    }
    assert UUID(response.headers["x-request-id"])


@pytest.mark.parametrize(
    "payload",
    ["<script>alert('xss')</script>", '<img src=x onerror="alert(1)">', "javascript:alert(1)"],
)
def test_json_preserves_original_strings_and_does_not_render_html(client, payload):
    response = client.post("/test/echo", headers={"Origin": ORIGIN}, json={"text": payload})
    assert response.status_code == 200
    assert response.json() == {"text": payload}
    assert response.headers["content-type"] == "application/json"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_plain_html_text_is_escaped_only_at_output(client):
    payload = '<script>alert("xss")</script>&'
    response = client.get("/test/html", params={"text": payload})
    assert response.status_code == 200
    assert response.text == "<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;</p>"
    assert "<script>" not in response.text
    assert "content-security-policy" not in response.headers
    assert client.get("/docs").status_code == 200
    assert "content-security-policy" not in client.get("/docs").headers


@pytest.mark.parametrize(
    "url", ["https://example.com/a?b=1", "http://localhost:3000/a", "/shop/item"]
)
def test_public_urls_allow_only_supported_destinations(url):
    assert validate_public_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:text/html,<script>x</script>",
        "vbscript:x",
        "//evil.test",
        "\\evil.test",
        "/\\evil.test",
        " https://good.test",
        "java\nscript:x",
        "https://user:password@example.com",
        "https://example.com:99999",
        "",
    ],
)
def test_public_urls_reject_dangerous_or_ambiguous_schemes(url):
    with pytest.raises(ValueError):
        validate_public_url(url)


@pytest.mark.parametrize(
    "origin", ["*", "null", "https://mall.test/", "https://user@mall.test", "//mall.test"]
)
def test_origin_configuration_fails_closed(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, csrf_allowed_origins=[origin])


@pytest.mark.parametrize("key", ["short", "a" * 129, "a" * 32 + "\r\n"])
def test_invalid_server_key_configuration_is_rejected(key):
    with pytest.raises(ValidationError) as failure:
        Settings(_env_file=None, bff_shared_key=key)
    assert key not in str(failure.value)
