# AURA 백엔드 설계서

> **상태:** 최신화 초안 · Linear CRA-12 (상위 CRA-5)
> **짝 문서:** [요구사항 정의서](REQUIREMENTS.md) · [ERD](ERD.md) · [도메인 규칙](DOMAIN_RULES.md) · [FastAPI BFF 계약](../FASTAPI_BFF.md) · [공통 요청 처리](COMMON_MODULES.md) · [CSRF·XSS 보안](SECURITY_CSRF_XSS.md) · [JWT 인증·인가 기반](AUTHORIZATION_CORE.md)

## 0. 결정 요약

| 영역      | 결정                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| 위치      | `apps/api` (uv 프로젝트, 패키지 `aura_api`). FastAPI 앱 1개                                                       |
| 아키텍처  | **Modular Monolith** + 4계층. 폴더는 계층별(`api`·`services`·`domain`·`infra`)로, 파일은 업무 영역 이름으로 (#35) |
| 계약      | Next BFF가 공개한 경로·DTO를 그대로 구현. BFF·화면 코드는 바꾸지 않음                                             |
| 인증      | **JWT** Access Token을 BFF가 HttpOnly 쿠키에서 꺼내 `Authorization: Bearer`로 전달(#37). 로그아웃 시 `jti` 폐기   |
| Refresh   | 백엔드에서 Refresh Token 발급·저장(해시)·회전·재사용 감지 구현. BFF 연결은 후속                                   |
| 관리자    | 고객 `users`와 분리된 `admins` 테이블, 별도 로그인 API·쿠키. 업무 API는 #32 계약                                  |
| 장바구니  | 범위 밖(브라우저). 주문이 `items`를 받아 서버가 다시 구성·가격 계산                                               |
| 데이터    | PostgreSQL 16, SQLAlchemy 2.x 비동기 + asyncpg, Alembic. 테이블 21개는 [ERD](ERD.md)·`db/schema.sql`(#33·#36)     |
| 업무 규칙 | 순수 Python 도메인 계층([도메인 규칙](DOMAIN_RULES.md)), 구현·테스트 완료(#30)                                    |
| 공통 처리 | 요청 ID·공통 오류(CRA-8), CSRF 출처 검사·보안 헤더(#29), JWT 검증·인가(#31) — 이미 구현됨                         |

## 1. 전체 구성

```text
브라우저 (TanStack Query, 장바구니 = localStorage)
   │ 같은 출처 /api/*  ·  HttpOnly 쿠키(JWT)
   ▼
Next.js BFF (apps/web/src/app/api/**/route.ts, server/bff, server/backend)
   │ 허용한 경로만 · 쿠키의 JWT → Authorization: Bearer · X-Request-ID · 공유키(서버 간 호출)
   ▼
FastAPI (apps/api, /api/v1/*)
   ├─ api/       표현: 라우터, 요청·응답 모델
   ├─ services/  서비스: 유스케이스, 트랜잭션, 소유권 확인
   ├─ domain/    도메인: 순수 업무 규칙 (catalog·identity·atelier·ordering·partner)
   ├─ infra/     인프라: DB 연결, ORM 모델, 저장소, 시드
   └─ core/      공통: 요청 ID · 공통 오류 · CSRF · JWT 검증 · 설정
   │ SQLAlchemy async / asyncpg
   ▼
PostgreSQL (Alembic 마이그레이션, catalog.json 기반 시드)
```

## 2. 아키텍처

### 2.1 Modular Monolith를 고른 이유

| 방식                 | 장점                                               | 단점                                   | 판단              |
| -------------------- | -------------------------------------------------- | -------------------------------------- | ----------------- |
| Microservices        | 독립 배포·확장, 장애 격리                          | 서비스 간 통신·분산 트랜잭션·운영 부담 | 과함              |
| **Modular Monolith** | 기능별 책임 분리, 배포 1개, 주문을 트랜잭션 하나로 | 모듈 경계를 지키는 규율 필요           | **선택**          |
| 전통적 MVC           | 가장 단순                                          | 기능이 늘면 규칙이 한곳에 몰림         | 4계층 조건에 불리 |

### 2.2 계층별 폴더

중간 발표 아키텍처의 4계층과 코드 폴더를 맞췄다(#35). 업무 영역은 각 계층 폴더 안의 **파일 이름**으로 나눈다.

```text
apps/api/aura_api/
  main.py, config.py          # 앱 조립·설정
  api/                        # 표현 계층
    router.py, health.py      #   (업무 라우터: catalog.py, auth.py, admin/ … 추가 예정)
  services/                   # 서비스 계층 (catalog.py, identity.py … 추가 예정)
  domain/                     # 도메인 계층 ← 구현됨 (#30)
    errors.py                 #   DomainError (도메인 → HTTP 상태 매핑 기준)
    catalog.py, identity.py, atelier.py, ordering.py, partner.py
  infra/                      # 인프라 계층 ← DB 기반 구현됨 (#36)
    database.py               #   Base, 비동기 엔진, 요청별 세션
    models/<영역>.py          #   ORM 모델 (identity·catalog·atelier·ordering·partner·admin)
    seed.py                   #   db/seed.sql 적재
    repositories/             #   조회·저장 (추가 예정)
  core/                       # 공통 모듈 (CRA-8, #29, #31)
```

| 계층           | 폴더        | 하는 일                                                   | 하지 않는 일                    |
| -------------- | ----------- | --------------------------------------------------------- | ------------------------------- |
| Presentation   | `api/`      | 경로, 요청 본문 검증, 응답 모델(공개 필드만), 인증 의존성 | 업무 판단, SQL                  |
| Service        | `services/` | 유스케이스 순서, **트랜잭션 시작·커밋**, 소유권 확인      | 프레임워크 세부, 규칙 직접 구현 |
| Domain         | `domain/`   | 업무 규칙, 상태 전이, 금액 계산                           | DB·HTTP·시간·난수 같은 I/O      |
| Infrastructure | `infra/`    | ORM 모델, 저장소, DB 접근, ORM ↔ 도메인 변환              | 커밋 결정                       |

**의존 방향:** `api` → `services` → `domain`, `services` → `infra`. `domain`은 다른 계층을 import하지 않는다.

**영역 간 규칙:** 다른 영역의 저장소를 직접 쓰지 않고 그 영역의 service 함수를 호출한다. 한 요청 안에서는 같은 DB 세션(트랜잭션)을 공유한다. 예: ordering → catalog(재고 차감), ordering → identity(쿠폰 사용).

## 3. API 설계 (BFF 계약 구현)

FastAPI 경로 = BFF 경로의 `/api` → `/api/v1`. trailing slash 리다이렉트 없음(`redirect_slashes=False`). JSON 필드는 camelCase.

### 3.1 고객 API

| 메서드 | FastAPI 경로                    | 영역     | 요청 → 응답                                                                             | 인증            |
| ------ | ------------------------------- | -------- | --------------------------------------------------------------------------------------- | --------------- |
| GET    | `/api/v1/catalog`               | catalog  | → `Catalog`                                                                             | —               |
| GET    | `/api/v1/catalog/products/{id}` | catalog  | → `Product`, 없으면 404 (별칭 ID 지원)                                                  | —               |
| GET    | `/api/v1/auth/me`               | identity | → Bearer JWT로 확인한 `Member`, 토큰 없으면 401                                         | —               |
| POST   | `/api/v1/auth/register`         | identity | `{ name, email, password, marketing? }` → 201 `TokenPair`                               | —               |
| POST   | `/api/v1/auth/login`            | identity | `{ email, password }` → `TokenPair`                                                     | —               |
| POST   | `/api/v1/auth/logout`           | identity | → 204 (계열 폐기 후)                                                                    | 회원            |
| POST   | `/api/v1/auth/refresh`          | identity | Refresh Token → 새 Access Token + 새 Refresh Token                                      | Refresh Token   |
| GET    | `/api/v1/recipes`               | atelier  | → `Recipe[]` (비회원은 `[]`)                                                            | 선택            |
| POST   | `/api/v1/recipes`               | atelier  | `{ name, label, counts, parent? }` → 201 `Recipe`                                       | 회원            |
| DELETE | `/api/v1/recipes/{id}`          | atelier  | → `Recipe[]`                                                                            | 회원            |
| GET    | `/api/v1/atelier/draft`         | atelier  | → `AtelierDraft \| null`                                                                | 방문자(guestId) |
| PUT    | `/api/v1/atelier/draft`         | atelier  | `AtelierDraft` → `AtelierDraft`                                                         | 방문자          |
| DELETE | `/api/v1/atelier/draft`         | atelier  | → `null`                                                                                | 방문자          |
| GET    | `/api/v1/orders`                | ordering | → `Order[]`                                                                             | 회원            |
| POST   | `/api/v1/orders`                | ordering | `{ recipient, address, coupon?, items }` → 201 `Order`                                  | 회원(확인 필요) |
| POST   | `/api/v1/partner`               | partner  | `{ brand, name, email, introduction, message, type, consent, website? }` → 201 `{ id }` | —               |

### 3.2 관리자 API

| 메서드 | FastAPI 경로                                    | 요청 → 응답                                                                         |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/api/v1/admin/auth/login`                      | `{ email, password }` → 관리자 Access JWT·공개 관리자 프로필                        |
| POST   | `/api/v1/admin/auth/logout`                     | → 관리자 토큰 폐기                                                                  |
| GET    | `/api/v1/admin/session`                         | → 현재 관리자 또는 401                                                              |
| POST   | `/api/v1/admin/admins`                          | `{ email, name, password }` → 201 (로그인한 관리자만)                               |
| GET    | `/api/v1/admin/overview`                        | → `AdminOverview`                                                                   |
| GET    | `/api/v1/admin/products`                        | 쿼리 `q`, `collection`, `stock=low\|out`, `page` → `AdminPage<AdminProduct>`        |
| GET    | `/api/v1/admin/products/{id}`                   | → `AdminProductDetail` (변경 이력 포함)                                             |
| PATCH  | `/api/v1/admin/products/{id}`                   | `{ version, name?, englishName?, description?, price?, image?, featured?, isNew? }` |
| POST   | `/api/v1/admin/products/{id}/stock-adjustments` | `{ version, delta, reason, key }` → 201, 같은 `key`는 200                           |
| GET    | `/api/v1/admin/orders`, `/{id}`                 | 쿼리 `from`, `to`, `page` → `AdminPage<AdminOrderSummary>` / `AdminOrder`           |
| GET    | `/api/v1/admin/inquiries`, `/{id}`              | 쿼리 `status`, `page` → `AdminPage<AdminInquirySummary>` / `AdminInquiry`           |
| PATCH  | `/api/v1/admin/inquiries/{id}`                  | `{ version, status?, memo? }` → `AdminInquiry`                                      |

`AdminPage<T>`는 `{ items, total, page, pageSize }`, `pageSize`는 20. 수정은 `version`이 다르면 409(낙관적 잠금). 상품 수정·재고 조정·문의 처리·관리자 등록은 `admin_audit_logs`에 남긴다.

### 3.3 DTO

웹 타입과 같은 이름·형태로 응답 모델을 만든다.

| DTO          | 필드                                                                                   | 정의 위치(웹)                       |
| ------------ | -------------------------------------------------------------------------------------- | ----------------------------------- |
| Catalog      | products, collections, types, ingredients, scentFamilies, atelier.suggestedNames, home | `features/catalog/model/catalog.ts` |
| AccountState | `user: { id, email, name, coupon, marketing? } \| null`, `guestId`                     | `features/account/model/account.ts` |
| Recipe       | id, parent?, version, name, label, counts, color, created                              | `features/atelier/model/recipes.ts` |
| AtelierDraft | counts, name, label, step                                                              | `features/atelier/model/recipes.ts` |
| Order        | id, items(`CartItem[]` + 서버 `unitPrice`), total, recipient, address, created         | `features/checkout/model/order.ts`  |
| Admin\*      | AdminOverview, AdminProduct(Detail), AdminOrder(Summary), AdminInquiry(Summary)        | `features/admin/model/admin.ts`     |

## 4. 인증·인가 (JWT)

### 4.1 토큰 전달

BFF는 HttpOnly `aura_access` 쿠키의 Access JWT만 `Authorization: Bearer <JWT>`로 FastAPI에 전달한다. FastAPI는 TokenPair JSON을 반환하며 BFF가 Access와 Refresh를 별도 쿠키에 보관한다. 브라우저 Authorization·사용자 ID·백엔드 쿠키는 전달하지 않는다. 서버 세션은 없다.

| 항목        | 값                                                                                  |
| ----------- | ----------------------------------------------------------------------------------- |
| 클레임      | 필수 `sub`, `jti`, `iat`, `exp`, `iss`, `aud`. 방문자 ID와 개인정보를 포함하지 않음 |
| 검증        | HS256·명시적 키·issuer·audience·만료·발급 기록·폐기·활성 회원                       |
| 사용자 조회 | FastAPI `/auth/me`는 Member, BFF `/api/auth/me`는 화면용 AccountState               |
| 실패        | 보호 API 401에서는 쿠키 유지, Refresh 401에서는 두 쿠키 삭제                        |

### 4.2 Refresh Token

Refresh 원문은 BFF의 HttpOnly `aura_refresh`(Path=/api/auth), 해시는 DB에 보관한다. 회전마다 기존 Refresh를 소비하고 재사용 감지 시 계열 전체를 폐기한다. `auth_token_families`와 `refresh_tokens`는 마이그레이션 0002의 구조를 사용한다. Access 발급 기록은 `refresh_tokens`에 통합하며 `auth_access_tokens`는 사용하지 않는다.

브라우저는 Web Lock으로 갱신·로그인·로그아웃을 직렬화하고 401에서 갱신 후 최초 요청을 한 번만 재시도한다. BFF는 백엔드 쓰기를 재시도하지 않는다. 상세 규칙은 [BFF JWT 계약](../FASTAPI_BFF.md#jwt-인증)을 따른다.

### 4.3 흐름

1. **첫 방문:** 비인증 방문자 UUID 쿠키 생성. 서버 인증 세션·익명 JWT는 발급하지 않음.
2. **가입·로그인:** 계정 생성 또는 비밀번호 검증 후 Access JWT·Refresh 발급. BFF가 `/auth/me`로 회원 조회.
3. **보호 요청:** JWT와 발급·폐기·활성 회원 검증 후 `sub`를 기준으로 업무 인가.
4. **갱신:** 일회용 Refresh 회전, 새 토큰 쿠키 적용. 기존 Access는 자체 만료 또는 계열 폐기까지 유효.
5. **로그아웃:** 계열의 Access·Refresh 폐기 커밋 후 204. BFF가 두 토큰 쿠키 삭제. 방문자 UUID와 로컬 장바구니 유지.
6. **정리:** 만료 토큰·폐기 기록 정리는 별도 운영 과제.

### 4.4 관리자 인증

관리자 로그인·등록·JWT 발급 저장소와 BFF는 연결되어 있다. 관리자는 `admins` 테이블 계정으로 `/api/v1/admin/auth/login`에서 로그인하고, BFF가 관리자 전용 JWT 쿠키를 Bearer로 변환한다. 웹 경로 `/api/admin/auth/me`는 FastAPI `/admin/session`으로 연결하며 서버 세션 ID는 사용하지 않는다. 고객 토큰으로는 관리자 API를 쓸 수 없다. FastAPI는 관리자 요청마다 `admins.status = 'active'`를 다시 확인해 비활성화·로그아웃을 즉시 반영한다. 첫 관리자는 CLI 명령으로 만들고, 이후 관리자는 로그인한 관리자가 등록한다.

### 4.5 인가

| 리소스      | 기준                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| 레시피·주문 | 토큰의 회원 ID(`sub`)로만 조회·변경. 남의 ID는 404. 요청 본문의 사용자 ID는 쓰지 않음 |
| 조향 초안   | 비인증 방문자 `guestId` (회원 인증·권한과 분리)                                       |
| 관리자 API  | 활성 `admins` 계정 토큰만. 미인증 401, 고객 토큰 403                                  |
| 계정 전환   | `X-Account-Owner`가 실제 주인과 다르면 409 (보조 확인, 소유권 판단에 쓰지 않음)       |

## 5. 데이터

테이블·컬럼·제약은 [ERD](ERD.md)와 `apps/api/db/schema.sql`을 따른다. 테이블 24개: 회원·인증 7(users·admins·user_coupons·revoked_tokens·auth_token_families·refresh_tokens·admin_sessions), 상품 8, 조향 3, 주문 3, 문의 1, 관리자 운영 2(stock_adjustments·admin_audit_logs). 장바구니 테이블 없음.

| 원칙              | 내용                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| ID                | 회원·관리자·주문·토큰(`jti`)·방문자(`guest_id`)는 UUID. 상품·향료·컬렉션은 `catalog.json` 문자열 ID |
| 스냅샷            | 주문 항목에 주문 당시 상품명·단가·Gift Set 구성 복사, 상품 FK 없음                                  |
| 계산값 저장 안 함 | 비중, 쿠폰 보유 여부, 유형 이름                                                                     |
| 금액              | 원 단위 정수, 가격 미정은 `NULL`                                                                    |
| 마이그레이션      | Alembic 0001·0002가 리비전별 고정 SQL을 실행 → SQL과 ORM이 어긋나지 않음(테스트로 검사)             |
| 시드              | `python -m aura_api.infra.seed`로 `db/seed.sql` 적재(반복 실행해도 중복 없음)                       |

## 6. 트랜잭션·동시성

| 유스케이스            | 트랜잭션  | 묶는 작업                                                                   |
| --------------------- | --------- | --------------------------------------------------------------------------- |
| 가입                  | 필요      | users + user_coupons + auth_token_families + refresh_tokens                 |
| 레시피 저장           | 필요      | recipes + recipe_ingredients                                                |
| **주문 접수**         | **필수**  | 재고 조건부 차감 + orders + order_items + order_item_selections + 쿠폰 사용 |
| Refresh 재발급        | 필요      | 기존 토큰 사용 처리 + 새 토큰 저장 (재사용이면 계열 폐기)                   |
| 로그아웃              | 필요      | revoked_tokens 등록 + Refresh 계열 폐기                                     |
| 관리자 재고 조정      | 필요      | products(version 확인) + stock_adjustments + admin_audit_logs               |
| 관리자 상품·문의 수정 | 필요      | 대상 행(version 확인) + admin_audit_logs                                    |
| 조회·초안 저장·문의   | 단일 문장 | —                                                                           |

**주문 처리 순서**

1. 카탈로그 스냅샷을 읽고 도메인 `price_order()`로 항목 재구성·가격·재고 수요 계산 (규칙 위반이면 여기서 거절)
2. 트랜잭션 시작 → `stock_needs`를 **상품 ID 순서로** "재고 ≥ 필요 수량일 때만 차감"(영향 행 0이면 전체 롤백, 409)
3. 쿠폰 사용 시 "사용 전일 때만 사용 처리"(영향 행 0이면 롤백)
4. 주문·항목·Gift Set 구성 저장(스냅샷) → 커밋

| 위험                    | 대응                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| 마지막 재고에 동시 주문 | 조건부 차감 + `CHECK(stock BETWEEN 0 AND 99999)`                      |
| 데드락                  | 상품 ID 순서로 차감                                                   |
| 쿠폰 이중 사용          | 조건부 상태 변경, 회원당 1장 UNIQUE                                   |
| 같은 이메일 동시 가입   | `UNIQUE(lower(email))` → 409                                          |
| 관리자 동시 수정        | `version` 비교 후 갱신(영향 행 0이면 409)                             |
| 재고 조정 재전송        | `stock_adjustments.request_key` UNIQUE → 같은 요청은 한 번만 반영     |
| Refresh 동시 재발급     | 조건부 "사용 전일 때만 사용 처리", 실패 시 재사용으로 판단            |
| 비동기 ORM 실수         | 요청당 세션 1개, 관계는 명시적 로딩, ORM 객체를 응답에 직접 쓰지 않음 |

## 7. 오류 처리

| 발생 지점           | 처리                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| 요청 본문 형식 오류 | FastAPI 422 → 공통 형식 `VALIDATION_ERROR` (CRA-8)                                         |
| 도메인 규칙 위반    | `DomainError.kind` → `invalid` 400 · `unauthorized` 401 · `not_found` 404 · `conflict` 409 |
| 인증 실패           | 401 + `WWW-Authenticate: Bearer` (#31)                                                     |
| 예상하지 못한 오류  | 500 `INTERNAL_ERROR`, 내부 정보 숨김 (CRA-8)                                               |

현재 공통 오류 처리기는 상태 코드별 공통 문구만 내보낸다. "같은 컬렉션의 제품 3개를 선택해 주세요." 같은 도메인 `message`를 화면까지 전달할지(예: 허용 목록의 오류 코드만 메시지 전달) 공통 모듈과 합의한다.

## 8. 인프라

### 8.1 로컬·CI (구현됨)

- PostgreSQL 16 (Docker)
- 실행 순서: DB → `alembic upgrade head` → `python -m aura_api.infra.seed` → `npm run dev:api` → `npm run dev:web`(`API_URL`·`API_PREFIX`·`API_ACCESS_COOKIE`·`API_REFRESH_COOKIE`)
- 설정: `AURA_DATABASE_URL`(`postgresql+asyncpg://`), JWT 설정(`AURA_JWT_*`), `AURA_BFF_SHARED_KEY`. `apps/api/.env`(Git 제외), 예시는 `.env.example`
- CI: PR마다 백엔드 검사·테스트, 프론트 검사·빌드, Docker 이미지 빌드(#34)
- Docker 이미지에 마이그레이션 파일(`alembic.ini`·`migrations/`·`db/`) 포함은 인프라 담당이 반영 예정

### 8.2 운영 가정 (설계만)

| 주제      | 설계                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------- |
| SPOF 제거 | 노드 2대 + VIP(keepalived), Caddy, Next·FastAPI 컨테이너 2개씩(무상태, JWT), PostgreSQL Primary + Standby |
| DB 계정   | 마이그레이션용·앱용·조회용 분리, 앱은 DML만                                                               |
| 키 회전   | JWT 비대칭키 + `kid`: 새 키 배포 → 새 키로 발급 → 기존 토큰 만료 후 이전 키 제거. 유출 시 즉시 폐기       |
| TLS       | 브라우저↔서비스 HTTPS, FastAPI↔PostgreSQL `sslmode=verify-full`                                           |
| 관측      | 요청 ID로 로그 연결(CRA-8), 지표(요청 수·오류율·p95·DB 연결), 추적(OpenTelemetry)                         |
| CI/CD     | PR 검사 → 스테이징 → 승인 → 배포(마이그레이션 → 앱) → 헬스체크·롤백                                       |

## 9. 테스트

| 종류     | 대상                                                 | 상태                     |
| -------- | ---------------------------------------------------- | ------------------------ |
| 도메인   | 규칙별 통과·거절 (`apps/api/tests/domain/`)          | 구현됨 (#30)             |
| 공통     | 요청 ID·오류·CSRF·보안 헤더·JWT 검증                 | 구현됨 (CRA-8, #29, #31) |
| DB       | ORM↔실제 스키마 차이, 시드 반복, 제약 (`tests/db/`)  | 구현됨 (#36)             |
| BFF 연결 | 실제 JWT 검증기로 로그인·만료·위조·폐기 후 재접근    | 구현됨 (#37)             |
| 통합     | API → 실제 PostgreSQL, 소유권, 트랜잭션, 관리자 권한 | 예정                     |
| 동시성   | 재고 1개 동시 주문, 쿠폰·Refresh 동시 사용           | 예정                     |
| E2E      | 웹 Playwright를 FastAPI에 연결                       | 예정                     |

## 10. 진행 상황과 다음 단계

| 단계                         | 상태                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| ERD                          | 완료 (#23, 관리자 확장 #33)                                          |
| 공통 요청 처리·보안·JWT 검증 | 완료 (CRA-8 #26, #29, #31)                                           |
| 도메인 규칙                  | 완료 (#30)                                                           |
| DB 스키마·ORM·마이그레이션   | 완료 (#33, #35, #36)                                                 |
| BFF JWT 연결 · Docker·CI     | 완료 (#37, #34)                                                      |
| 요구사항·설계 문서           | 이 문서 (CRA-12)                                                     |
| 인증 테이블(Refresh)         | 다음 — 공통 모듈 컬럼 정리 후 마이그레이션 0002                      |
| 업무 API                     | 다음 — catalog → identity → atelier → ordering → partner → 관리자 순 |
| FastAPI 연결 E2E             | 다음                                                                 |

## 11. 확인 필요

1. 비회원 주문 허용 여부 (제안: 회원만 — ERD `orders.user_id` 필수, `GET /orders`도 회원만)
2. 맞춤 조향 주문 허용(현재 허용)과 재고 차감 대상(현재 단품 + 구성품 + Gift Set 상품)
3. 도메인 오류 메시지를 응답에 담는 방식 (공통 모듈)
4. Access·Refresh 수명, 재발급 경로, Refresh 전달 방식, 관리자도 Refresh를 쓰는지
5. 익명 방문자 초안의 저장·보존 범위 (방문자 UUID는 사용자 인증에 사용하지 않음)
6. 관리자 인증의 BFF 계약 갱신 (현재 [BFF 계약](../FASTAPI_BFF.md) 관리자 절은 회원 `role` 방식)
7. 회원 정지(`users.is_active`) 정책
