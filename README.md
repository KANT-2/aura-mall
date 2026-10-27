# AURA — From Scent to Identity

향을 발견하고 나만의 취향을 기록하는 프래그런스 커머스와 퍼스널 아틀리에입니다. Next.js 웹 앱과 Python FastAPI를 함께 관리합니다.

## 구조와 현재 구현

```text
apps/
  web/                 # Next.js 스토어프런트·BFF·개발용 Mock·웹 테스트
  api/                 # FastAPI 앱·설정·라우터·Python 테스트
docs/
  README.md            # 문서 목록
  FASTAPI_BFF.md       # 웹과 백엔드 사이의 API 계약
  product/             # 제품 기획
  assets/              # 자산 안내·미리보기
  archive/             # 과거 구현·QA 기록
```

웹은 장바구니를 브라우저 로컬 스토리지에 저장하고, 상품·회원·조향·주문·문의 흐름은 Mock API로 제공합니다. FastAPI에는 JWT 인증과 카탈로그·문의·레시피·주문·관리자 업무 API가 구현되어 있습니다. 웹과 API의 연결은 [BFF 계약](docs/FASTAPI_BFF.md)에 따라 진행합니다.

Node 의존성은 npm workspaces와 루트 `package-lock.json`, Python 의존성은 `apps/api/pyproject.toml`과 `apps/api/uv.lock`으로 관리합니다. 공통 포맷 설정은 루트, 앱 전용 설정과 생성 파일은 각 앱 디렉터리에 둡니다.

## 웹 실행

Node.js 22.12 이상과 npm이 필요합니다. 아래 명령은 모두 저장소 루트에서 실행합니다.

```sh
npm ci
npm run dev
```

Next.js는 `http://localhost:3000`, Mock API는 `http://127.0.0.1:4000`에서 함께 실행됩니다. 웹 설정 파일은 `apps/web/.env.local`이며, 필요하면 [예제](apps/web/.env.example)를 복사합니다. 상세 구조·Mock·E2E·CSS 기준은 [웹 개발 안내](apps/web/README.md)에 있습니다.

## FastAPI 실행

Python 3.12 이상과 [uv](https://docs.astral.sh/uv/getting-started/installation/)가 필요합니다. 웹과 별도 터미널에서 실행합니다.

```sh
npm run setup:api
cp apps/api/.env.example apps/api/.env
npm run dev:api
```

FastAPI는 `http://127.0.0.1:8000`에서 실행되며 `/health`, `/api/v1/health`, `/docs`, `/openapi.json`을 제공합니다. 현재 웹의 기본 백엔드는 Mock이며, 업무 API가 구현된 뒤 FastAPI로 연결합니다. 설정·라우터 추가·연결 방법은 [API 개발 안내](apps/api/README.md)에 있습니다.

## 검증과 빌드

| 명령                     | 범위                                           |
| ------------------------ | ---------------------------------------------- |
| `npm run check:web`      | 웹 ESLint·CSS·TypeScript·Vitest                |
| `npm run check:api`      | Python Ruff 린트·포맷·pytest                   |
| `npm run check:contract` | OpenAPI 타입 생성·공개 DTO·경로·버전 계약 검사 |
| `npm run check`          | 공통 포맷·두 앱 검사·OpenAPI 계약 검사         |
| `npm run build`          | Next.js 프로덕션 빌드                          |
| `npm run start:mock`     | 프로덕션 웹과 Mock 동시 실행                   |
| `npm run format`         | 공통 Prettier·Python Ruff 포맷 적용            |

전체 검증과 공통 포맷 적용에는 Node·Python·uv가 모두 필요합니다. 웹 빌드는 Google Fonts에 접근할 수 있어야 합니다. 브라우저 검증 명령은 [웹 검증 안내](apps/web/README.md#검증)를 참고하세요.

## 문서

PostgreSQL TLS, self-signed CA 기반 인증서 자동 갱신, 접속 비밀번호 회전, 로컬 복제본과 복구 절차는 [DB 운영 안내](docs/operations/DATABASE.md)를 참고하세요. 기존 Compose에 별도 설정을 추가하는 방식이며 최초 전환은 운영자가 수행합니다.

[문서 목록](docs/README.md)에서 제품 기획, 앱별 개발 안내, API 계약, 에셋과 과거 검수 기록을 찾을 수 있습니다. 작업 지침은 [AGENTS.md](AGENTS.md)와 [웹 전용 지침](apps/web/AGENTS.md)에 있습니다.
