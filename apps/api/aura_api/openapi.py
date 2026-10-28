"""Public contract metadata and a deterministic, database-free OpenAPI export."""

import argparse
import json
from pathlib import Path

from fastapi import FastAPI

from aura_api.core.errors import ErrorResponse

CONTRACT_VERSION = "1.6.0"
ERROR_RESPONSES = {
    code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500, 503)
}
TAGS = [
    {"name": "health", "description": "서비스 상태"},
    {"name": "auth", "description": "회원 JWT 발급·조회·Refresh 회전·폐기"},
    {"name": "catalog", "description": "공개 상품·향료 카탈로그"},
    {"name": "partner", "description": "공개 입점 문의 접수"},
    {"name": "recipes", "description": "회원 소유 레시피"},
    {"name": "atelier", "description": "방문자별 조향 초안. 회원 데이터와 분리합니다."},
    {"name": "orders", "description": "회원 주문 조회·접수. 화면 결제 활성화와는 별도입니다."},
    {
        "name": "payments",
        "description": "회원 주문 결제. PG 승인과 서버 금액 검증 후에만 결제 완료입니다.",
    },
    {"name": "admin", "description": "관리자 JWT 전용 인증·등록·운영 API"},
]
DESCRIPTION = """AURA FastAPI 업무 API입니다. 브라우저는 Next BFF의 `/api`를 사용합니다.

### Swagger에서 호출하기

1. 회원 `/auth/login` 또는 관리자 `/admin/auth/login`으로 로그인합니다.
2. 응답의 `accessToken`만 **Authorize**의 MemberJWT 또는 AdminJWT에 입력합니다.
   두 토큰은 서로 대체할 수 없습니다. Refresh Token은 `/auth/refresh` 본문에만 사용합니다.
3. 변경 요청에는 허용된 Origin이 필요합니다. 로컬 Swagger를 사용할 때
   `AURA_CSRF_ALLOWED_ORIGINS`에 실제 FastAPI 출처(예: `http://localhost:8000`)를 명시합니다.
   서버 간 요청은 Origin 대신 별도 `X-Aura-BFF-Key`를 사용합니다. 보호 검사를 우회하지 않습니다.
4. 조향 초안에는 별도의 무작위 UUID v4 `X-Guest-ID`가 필요합니다. 회원 인증 수단이 아닙니다.

인증 정보는 Swagger에 영구 저장하지 않습니다. 모든 오류는 `{error: {code, message}}` 형식이며
비밀번호·검증 입력 원문을 포함하지 않습니다. `/admin/session`은 JWT 프로필 조회 경로이며
서버 세션 ID를 발급하지 않습니다. 날짜는 ISO 8601, 금액은 원 단위 정수입니다.
"""


def configure_openapi(app: FastAPI, prefix: str) -> None:
    """Describe existing authentication without replacing the strict Bearer parser."""
    default_openapi = app.openapi

    def schema():
        result = default_openapi()
        result["info"]["x-contract-version"] = CONTRACT_VERSION
        result["components"]["securitySchemes"] = {
            "MemberJWT": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "회원 Access JWT. 관리자 JWT·Refresh Token은 사용할 수 없습니다.",
            },
            "AdminJWT": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "관리자 전용 Access JWT. 회원 토큰은 관리자 권한이 아닙니다.",
            },
        }
        for path, operations in result["paths"].items():
            relative = path.removeprefix(prefix)
            for method, operation in operations.items():
                if method not in {"get", "post", "put", "patch", "delete"}:
                    continue
                if relative.startswith("/admin/") and relative != "/admin/auth/login":
                    operation["security"] = [{"AdminJWT": []}]
                elif (
                    relative in {"/auth/me", "/auth/logout", "/orders"}
                    or relative.startswith(("/payments", "/orders/", "/questions"))
                    or (relative.startswith("/products/") and method != "get")
                    or (relative.startswith("/recipes") and method != "get")
                ):
                    operation["security"] = [{"MemberJWT": []}]
                elif relative in {"/recipes", "/atelier/draft"} or (
                    relative.startswith("/products/") and method == "get"
                ):
                    operation["security"] = [{}, {"MemberJWT": []}]
                if relative == "/atelier/draft":
                    for parameter in operation.get("parameters", []):
                        if parameter["name"] == "X-Guest-ID":
                            parameter["required"] = True
                            parameter["schema"] = {
                                "type": "string",
                                "format": "uuid",
                                "pattern": (
                                    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}"
                                    "-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
                                ),
                            }
        return result

    app.openapi = schema


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the AURA v1 contract without a database")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    from aura_api.config import Settings
    from aura_api.main import create_app

    settings = Settings(
        _env_file=None,
        app_name="AURA API",
        api_prefix="/api/v1",
        database_url=None,
        jwt_algorithm=None,
        jwt_signing_key=None,
        jwt_issuer=None,
        jwt_audience=None,
        bff_shared_key=None,
        csrf_allowed_origins=[],
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(create_app(settings).openapi(), ensure_ascii=False, sort_keys=True, indent=2)
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
