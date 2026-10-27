# AURA FastAPI

`apps/api`는 uv로 관리하는 독립 Python 앱입니다. 카탈로그·문의·레시피·주문·관리자 업무 API와 JWT 인증을 제공하며, 웹 연결 계약은 [BFF 계약](../../docs/FASTAPI_BFF.md)에 따라 구현합니다.

[저장소 안내](../../README.md) · [전체 문서](../../docs/README.md) · [웹 개발 안내](../web/README.md)

## 설치와 실행

Python 3.12 이상과 uv가 필요합니다. 아래 명령은 저장소 루트에서 실행합니다.

```sh
npm run setup:api
cp apps/api/.env.example apps/api/.env
npm run dev:api
```

`setup:api`는 `uv.lock`에 고정된 의존성을 `apps/api/.venv`에 설치합니다. `dev:api`는 변경 시 재시작하는 Uvicorn 서버를 `http://127.0.0.1:8000`에 띄웁니다. 자동 재시작 없이 실행하려면 `npm run start:api`를 사용합니다.

npm 없이 직접 실행할 수도 있습니다.

```sh
uv sync --directory apps/api --locked
uv run --directory apps/api --locked uvicorn aura_api.main:app --reload --host 127.0.0.1 --port 8000
```

## 구조

```text
aura_api/
  main.py             # 앱 팩토리·라우터 연결·DB 엔진 수명
  config.py           # 환경 변수와 .env 읽기
  api/                # 표현 계층: 라우터·요청/응답 모델
    router.py         # 업무 라우터 등록
    health.py         # 헬스 체크와 응답 모델
    auth.py           # JWT 회원가입·로그인·사용자 조회·Refresh·로그아웃
    catalog.py        # GET /catalog, /catalog/products/{id}
    partner.py        # POST /partner
    recipes.py        # GET·POST /recipes, DELETE /recipes/{id}
    orders.py         # GET·POST /orders
    deps.py           # DB 세션, 로그인 회원 확인(토큰 sub = users.id)
    errors.py         # 도메인 규칙 위반 → 공통 오류 형식(code·message)
    admin/            # /admin/**: 로그인·세션·등록(auth.py), 상품·재고(products.py), 주문·문의·현황(operations.py), 관리자 확인(deps.py)
  services/           # 서비스 계층: 유스케이스·트랜잭션
    catalog.py        # 카탈로그 조회, 예전 상품 ID 별칭
    partner.py        # 입점 문의 검증·저장
    recipes.py        # 레시피 저장·다시 만들기(버전 +1)·삭제
    orders.py         # 주문 접수(가격·재고·쿠폰 한 트랜잭션)·주문 내역
    admin_products.py # 관리자 상품 수정(낙관적 잠금)·재고 조정(요청 키로 1회만)
    admin_operations.py # 관리자 주문 조회·문의 처리·현황
    admin_auth.py     # 관리자 로그인(Access Token만)·로그아웃·관리자 등록
  domain/             # 도메인 계층: 순수 Python 업무 규칙 (영역별 파일, 관리자 입력 규칙은 admin.py)
  infra/              # 인프라 계층
    database.py       # SQLAlchemy Base·비동기 엔진·요청별 세션
    models/           # 영역별 ORM 모델 (__init__.py가 전체 등록)
    repositories/     # 영역별 조회·저장 (커밋하지 않음)
    seed.py           # db/seed.sql 적재 명령
    create_admin.py   # 첫 관리자 생성 명령 (관리자가 없을 때만)
  core/               # 공통 모듈: 요청 ID·오류·인증·CSRF
db/
  schema.sql          # 최신 전체 구조, 테이블 24개 (0001 + 0002 + 0003 + 0004)
  seed.sql            # 상품·향료 초기 데이터 (generate_seed.py로 생성)
migrations/           # Alembic 환경과 리비전
  sql/                # 리비전별 고정 SQL (0001 초기 구조, 0002 Refresh Token)
alembic.ini           # Alembic 설정 (DB 주소는 AURA_DATABASE_URL)
tests/
  test_health.py      # 헬스 체크·OpenAPI·접두사·리다이렉트 검사
  test_catalog.py     # 카탈로그 응답 형태 (DB 없이)
  test_partner.py     # 입점 문의 규칙·오류 메시지 (DB 없이)
  test_recipes.py     # 레시피 로그인 요구 (DB 없이)
  test_orders.py      # 주문 로그인 요구 (DB 없이)
  domain/             # 도메인 규칙 단위 테스트 (DB 없음)
  db/                 # 실제 PostgreSQL 통합 테스트 (AURA_TEST_DATABASE_URL)
pyproject.toml        # Python 의존성·Ruff·pytest 설정
uv.lock               # 의존성 버전 고정
.env.example          # 설정 예제
```

## 데이터베이스

PostgreSQL 13 이상(개발은 16)을 사용합니다. 테이블 설계는 [ERD](../../docs/backend/ERD.md), DDL은 [db/schema.sql](db/schema.sql)입니다. `AURA_DATABASE_URL`이 없으면 DB를 쓰는 API는 요청을 거절합니다.

```sh
# 로컬 PostgreSQL 예시 (Docker)
docker run -d --name aura-db -e POSTGRES_PASSWORD=aura -e POSTGRES_DB=aura -p 127.0.0.1:5432:5432 postgres:16-alpine

# apps/api/.env
AURA_DATABASE_URL=postgresql+asyncpg://postgres:aura@127.0.0.1:5432/aura

# 저장소 루트에서: 테이블 생성 → 초기 데이터
uv run --directory apps/api --locked alembic upgrade head
uv run --directory apps/api --locked python -m aura_api.infra.seed
# 첫 관리자 (한 번만, 이후는 POST /admin/admins). 비밀번호는 AURA_ADMIN_PASSWORD 또는 입력
uv run --directory apps/api --locked python -m aura_api.infra.create_admin --email admin@aura.com --name 운영자
```

- 리비전은 `migrations/sql/`의 고정 SQL을 실행합니다(`0001` 초기 21개, `0002` Refresh Token·`users.is_active`, `0003` 관리자 토큰 `admin_sessions`, `0004` 입점 문의 제한 조회 인덱스, `0005` 회원 탈퇴 유예·로그인 실패 제한, `0006` 주문 상태·상태 이력). `db/schema.sql`은 모두 합친 최신 전체 구조입니다.
- 스키마를 바꿀 때는 새 리비전 SQL·`schema.sql`·ORM 모델(`aura_api/infra/models/<영역>.py`)을 함께 수정하고, 이미 적용된 리비전 SQL은 고치지 않습니다. `tests/db`가 마이그레이션 결과와 `schema.sql` 결과를 각각 ORM 모델과 비교합니다.
- DB 통합 테스트는 **지워도 되는 테스트 DB**에서만 실행합니다(모든 테이블을 삭제 후 다시 만듭니다). 설정하지 않으면 건너뜁니다.

```sh
AURA_TEST_DATABASE_URL=postgresql+asyncpg://postgres:aura@127.0.0.1:5432/aura_test npm run test:api
```

## 설정과 제공 경로

[config.py](aura_api/config.py)는 `AURA_` 환경 변수와 `apps/api/.env`를 읽습니다. 프로세스 환경 변수가 파일 값보다 우선합니다. [예제](.env.example)에는 다음 설정을 제공합니다.

| 변수              | 기본값     | 용도                                      |
| ----------------- | ---------- | ----------------------------------------- |
| `AURA_APP_NAME`   | `AURA API` | OpenAPI 문서의 앱 이름                    |
| `AURA_API_PREFIX` | `/api/v1`  | 버전별 API 접두사. 끝에 `/`를 붙이지 않음 |

| 경로                 | 응답과 용도                          |
| -------------------- | ------------------------------------ |
| `GET /health`        | `{ "status": "ok" }`, 서버 생존 확인 |
| `GET /api/v1/health` | 같은 응답, 설정한 API 접두사 확인    |
| `GET /docs`          | Swagger UI                           |
| `GET /openapi.json`  | 현재 구현한 API의 OpenAPI 스키마     |

## Swagger와 OpenAPI 계약

FastAPI 실행 후 `http://localhost:8000/docs`에서 Swagger UI를 사용할 수 있습니다. 회원과 관리자의 로그인 API 응답에서 받은 `accessToken`을 **Authorize**의 `MemberJWT` 또는 `AdminJWT`에 입력합니다. 토큰 문자열만 입력하며 Refresh Token은 사용하지 않습니다. 회원 토큰과 관리자 토큰은 서로 대체할 수 없고 인증 정보는 Swagger에 영구 저장하지 않습니다.

Swagger에서 변경 요청을 실행하려면 실제 접속하는 FastAPI 출처를 `AURA_CSRF_ALLOWED_ORIGINS`에 추가합니다. 예를 들어 아래 설정으로 실행하면 `http://localhost:8000/docs`에서 호출할 수 있습니다. 기존 웹 origin도 함께 유지합니다.

```sh
AURA_CSRF_ALLOWED_ORIGINS='["http://localhost:3000","http://localhost:8000"]' npm run dev:api
```

DB·JWT 설정과 최초 관리자 생성은 위 안내대로 준비합니다. `/atelier/draft`에는 무작위 UUID v4 `X-Guest-ID`를 입력합니다. 이 값은 방문자의 비민감 조향 초안에만 사용하며 회원 인증 수단이 아닙니다. 허용 Origin이 없는 서버 간 호출은 별도의 BFF 공유 키가 필요하며, Swagger에서도 CSRF 검사를 우회하지 않습니다.

오류는 Swagger의 공통 `ErrorResponse`를 따릅니다. 주문·재고 조정의 신규 처리 201과 중복 요청 200을 각각 표시합니다. `/admin/session`은 관리자 JWT 프로필 조회이며 서버 세션 로그인이 아닙니다.

```sh
# 저장소 루트에서 실행: DB 없이 스키마·타입 생성 및 프런트 계약 검사
npm run check:contract
# 스키마만 내보내기
uv run --directory apps/api --locked python -m aura_api.openapi --output /tmp/aura-openapi.json
```

계약 버전·변경 검토와 생성 파일 정책은 [계약 검사 안내](../web/contracts/README.md)를 따릅니다.

API 접두사를 변경해도 `/health`는 유지됩니다. OpenAPI에는 접두사를 붙인 헬스 체크가 노출됩니다. 경로 끝의 `/`를 자동으로 리다이렉트하지 않습니다.

## 업무 API 추가와 웹 연결

라우터는 `aura_api/api`에 추가하고 [router.py](aura_api/api/router.py)에 등록합니다. [main.py](aura_api/main.py)가 공통 접두사를 적용합니다. 요청·응답 모델은 BFF 계약의 camelCase JSON, 상태 코드, JWT 토큰, 오류 규칙을 따릅니다.

가격·소유권·인증·트랜잭션은 백엔드가 검증합니다. DB·인증 방식·결제 연결은 업무 구현 시 정하고, 현재 Mock의 동작과 [제품 기획](../../docs/product/PRD.md)을 함께 확인합니다.

웹이 사용하는 업무 API를 구현하고 계약 검증을 마친 뒤 `apps/web/.env.local`을 설정합니다.

```dotenv
API_URL=http://127.0.0.1:8000
API_PREFIX=/api/v1
API_ACCESS_COOKIE=aura_access
API_REFRESH_COOKIE=aura_refresh
# API_BFF_SHARED_KEY=<AURA_BFF_SHARED_KEY와 같은 무작위 서버 비밀값>
```

이후 `npm run dev:web`으로 웹 서버를 실행합니다. 브라우저는 동일 출처 `/api`를 호출하고 Next BFF가 FastAPI에 연결합니다. 현재 FastAPI에는 헬스 체크·카탈로그·입점 문의·레시피·주문 API와 JWT 인증 생명주기 기능이 구현되어 있습니다. BFF는 사용자 JWT 인증 계약에 연결됩니다.

BFF는 HttpOnly 쿠키의 Access JWT를 Bearer로 전달합니다. FastAPI의 TokenPair는 토큰 쿠키로 보관하며 `/auth/me`로 공개 회원 정보를 조회합니다. Refresh 자동 갱신과 로그아웃 204 처리를 연결했습니다. `npm run build`와 `npm run test:e2e:jwt`로 운영 인증 라우터를 통과하는 브라우저 흐름을 확인합니다. 전용 PostgreSQL 테스트와 운영 배포 검증은 별도로 수행합니다.

## 검증과 의존성 변경

```sh
npm run check:api
npm run test:api
npm run format:api
```

`check:api`는 Ruff 린트·포맷 검사와 pytest를 실행합니다. `test:api`는 pytest만, `format:api`는 Python 포맷 적용을 실행합니다.

의존성을 추가할 때는 루트에서 `uv add --directory apps/api <패키지>`를 사용합니다. 개발 도구는 `--dev`를 추가합니다. `pyproject.toml`과 `uv.lock`을 함께 반영하고 `.venv`와 로컬 `.env`는 버전 관리에서 제외합니다.

## 사용자 JWT 인증

`/auth/register`와 `/auth/login`은 TokenPair JSON, `/auth/me`는 Bearer JWT로 확인한 회원 프로필, `/auth/refresh`는 회전한 TokenPair, `/auth/logout`은 계열 폐기 후 204를 반환합니다. 회원가입은 계정·배송비 쿠폰·토큰 계열을 한 트랜잭션으로 생성합니다. FastAPI는 브라우저 쿠키나 서버 세션을 사용자 인증에 사용하지 않습니다. Next BFF가 토큰을 HttpOnly 쿠키로 보관·전달합니다. DB URL과 네 JWT 설정, BFF 공유 키가 필요합니다. 상세 계약은 [FastAPI BFF](../../docs/FASTAPI_BFF.md#jwt-인증)를 참고합니다.
