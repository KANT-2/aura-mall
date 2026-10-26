# AURA FastAPI

`apps/api`는 uv로 관리하는 독립 Python 앱입니다. 현재 헬스 체크·설정·라우터·테스트 골격을 제공하며, 상품·인증·장바구니 등 업무 API는 [BFF 계약](../../docs/FASTAPI_BFF.md)에 따라 구현합니다.

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
    catalog.py        # GET /catalog, /catalog/products/{id}
  services/           # 서비스 계층: 유스케이스·트랜잭션
    catalog.py        # 카탈로그 조회, 예전 상품 ID 별칭
  domain/             # 도메인 계층: 순수 Python 업무 규칙 (영역별 파일)
  infra/              # 인프라 계층
    database.py       # SQLAlchemy Base·비동기 엔진·요청별 세션
    models/           # 영역별 ORM 모델 (__init__.py가 전체 등록)
    repositories/     # 영역별 조회·저장 (커밋하지 않음)
    seed.py           # db/seed.sql 적재 명령
  core/               # 공통 모듈: 요청 ID·오류·인증·CSRF
db/
  schema.sql          # 테이블 21개 DDL (마이그레이션 0001이 그대로 실행)
  seed.sql            # 상품·향료 초기 데이터 (generate_seed.py로 생성)
migrations/           # Alembic 환경과 리비전
alembic.ini           # Alembic 설정 (DB 주소는 AURA_DATABASE_URL)
tests/
  test_health.py      # 헬스 체크·OpenAPI·접두사·리다이렉트 검사
  test_catalog.py     # 카탈로그 응답 형태 (DB 없이)
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
```

- 마이그레이션 `0001`은 `db/schema.sql`을 그대로 실행합니다. 팀이 검토하는 SQL과 실제 적용되는 DDL이 같습니다.
- 스키마를 바꿀 때는 `schema.sql`·ORM 모델(`aura_api/infra/models/<영역>.py`)·새 Alembic 리비전을 함께 수정합니다. `tests/db`가 모델과 실제 스키마의 차이를 검사합니다.
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

API 접두사를 변경해도 `/health`는 유지됩니다. OpenAPI에는 접두사를 붙인 헬스 체크가 노출됩니다. 경로 끝의 `/`를 자동으로 리다이렉트하지 않습니다.

## 업무 API 추가와 웹 연결

라우터는 `aura_api/api`에 추가하고 [router.py](aura_api/api/router.py)에 등록합니다. [main.py](aura_api/main.py)가 공통 접두사를 적용합니다. 요청·응답 모델은 BFF 계약의 camelCase JSON, 상태 코드, 세션 쿠키, 오류 규칙을 따릅니다.

가격·소유권·인증·트랜잭션은 백엔드가 검증합니다. DB·인증 방식·결제 연결은 업무 구현 시 정하고, 현재 Mock의 동작과 [제품 기획](../../docs/product/PRD.md)을 함께 확인합니다.

웹이 사용하는 업무 API를 구현하고 계약 검증을 마친 뒤 `apps/web/.env.local`을 설정합니다.

```dotenv
API_URL=http://127.0.0.1:8000
API_PREFIX=/api/v1
API_SESSION_COOKIE=aura_session
API_AUTH_MODE=jwt
# API_BFF_SHARED_KEY=<AURA_BFF_SHARED_KEY와 같은 무작위 서버 비밀값>
```

이후 `npm run dev:web`으로 웹 서버를 실행합니다. 브라우저는 동일 출처 `/api`를 호출하고 Next BFF가 FastAPI에 연결합니다. 현재 헬스 체크만 구현된 FastAPI로는 상품·세션 조회를 제공할 수 없습니다.

JWT 모드의 BFF는 설정한 쿠키의 토큰을 Bearer로 바꿉니다. 인증 업무 API는 공개 `Session` JSON과 JWT `Set-Cookie`를 반환해야 하며, 서명·수명·폐기·익명 방문자 보존은 FastAPI가 담당합니다. 실제 검증기를 연결한 테스트 전용 HTTP 검증은 루트의 `npm run build && npm run test:e2e:jwt`로 실행합니다. 테스트 앱의 발급·메모리 폐기 저장소는 운영 앱에 등록되지 않습니다.

## 검증과 의존성 변경

```sh
npm run check:api
npm run test:api
npm run format:api
```

`check:api`는 Ruff 린트·포맷 검사와 pytest를 실행합니다. `test:api`는 pytest만, `format:api`는 Python 포맷 적용을 실행합니다.

의존성을 추가할 때는 루트에서 `uv add --directory apps/api <패키지>`를 사용합니다. 개발 도구는 `--dev`를 추가합니다. `pyproject.toml`과 `uv.lock`을 함께 반영하고 `.venv`와 로컬 `.env`는 버전 관리에서 제외합니다.
