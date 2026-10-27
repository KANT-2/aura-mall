"""Swagger must describe the same JWT, DTO and error boundaries as the live API."""

import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.main import create_app
from aura_api.openapi import CONTRACT_VERSION


@pytest.fixture
def app():
    return create_app(Settings(_env_file=None, database_url=None))


def test_security_schemes_are_separate_and_public_routes_stay_public(app):
    schema = app.openapi()
    assert schema["info"]["x-contract-version"] == CONTRACT_VERSION
    schemes = schema["components"]["securitySchemes"]
    assert set(schemes) == {"MemberJWT", "AdminJWT"}
    assert all(item["scheme"] == "bearer" for item in schemes.values())
    paths = schema["paths"]
    assert paths["/api/v1/auth/me"]["get"]["security"] == [{"MemberJWT": []}]
    assert paths["/api/v1/admin/session"]["get"]["security"] == [{"AdminJWT": []}]
    assert paths["/api/v1/admin/admins"]["post"]["security"] == [{"AdminJWT": []}]
    assert paths["/api/v1/recipes"]["get"]["security"] == [{}, {"MemberJWT": []}]
    assert paths["/api/v1/atelier/draft"]["put"]["security"] == [{}, {"MemberJWT": []}]
    guest = paths["/api/v1/atelier/draft"]["put"]["parameters"][0]
    assert guest["name"] == "X-Guest-ID"
    assert guest["required"] is True
    assert guest["schema"]["format"] == "uuid"
    assert "security" not in paths["/api/v1/admin/auth/login"]["post"]
    assert "security" not in paths["/api/v1/auth/login"]["post"]
    assert "security" not in paths["/api/v1/catalog"]["get"]


def test_swagger_errors_use_the_sanitized_error_envelope(app):
    schema = app.openapi()
    for operations in schema["paths"].values():
        for operation in operations.values():
            for status, response in operation["responses"].items():
                if int(status) >= 400:
                    assert response["content"]["application/json"]["schema"] == {
                        "$ref": "#/components/schemas/ErrorResponse"
                    }
    assert "HTTPValidationError" not in schema["components"]["schemas"]


def test_replay_status_and_private_input_metadata_are_documented(app):
    schema = app.openapi()
    responses = schema["paths"]["/api/v1/orders"]["post"]["responses"]
    assert responses["200"]["content"] == responses["201"]["content"]
    password = schema["components"]["schemas"]["AdminCreateIn"]["properties"]["password"]
    assert password["writeOnly"] is True
    assert password["format"] == "password"
    assert schema["components"]["schemas"]["DraftIn"]["additionalProperties"] is False
    assert "429" in schema["paths"]["/api/v1/partner"]["post"]["responses"]


def test_swagger_is_available_without_a_database_and_does_not_persist_tokens(app):
    with TestClient(app) as client:
        response = client.get("/docs")
        assert response.status_code == 200
        assert '"persistAuthorization": false' in response.text
        assert client.get("/openapi.json").json()["info"]["x-contract-version"] == CONTRACT_VERSION
        # API documentation does not disable CSRF validation for Swagger calls.
        assert client.post("/api/v1/admin/auth/login", json={}).status_code == 403


def test_custom_prefix_preserves_security_metadata():
    app = create_app(Settings(_env_file=None, database_url=None, api_prefix="/api/v2"))
    assert app.openapi()["paths"]["/api/v2/admin/overview"]["get"]["security"] == [{"AdminJWT": []}]
