# AURA JWT 로그인·갱신·회전·로그아웃

## 현재 저장소 구조 — Access 기록 통합

JWT 저장소와 격리 테스트는 `users`, `revoked_tokens`, `auth_token_families`,
`refresh_tokens`의 네 테이블 계약을 사용합니다. `refresh_tokens`에
`access_jti UUID NOT NULL UNIQUE`, `access_expires_at TIMESTAMPTZ NOT NULL`을 저장하며
별도 `auth_access_tokens` 테이블은 조회하거나 생성하지 않습니다.

로그인과 회전은 Access·Refresh를 한 쌍으로 발급하고, 해시와 Access 메타데이터를 같은 행에
저장합니다. 정상 회전 후 이전 Access는 자체 만료까지 유효합니다. 따라서 Access 검증·로그아웃은
Refresh의 만료·소비 상태로 거절하지 않으며 Access 만료·계열 폐기·회원 활성·jti 차단을 확인합니다.
재사용 감지·로그아웃 시에는 계열의 모든 미만료 Access를 기존 `revoked_tokens`에 기록합니다.
회원의 다른 로그인 계열은 유지합니다. 사용자 → 계열 → 토큰 잠금과 커밋 후 응답 원칙도 유지합니다.

이는 예진 담당 저장소 코드와 테스트의 계약입니다. 우섭님 담당 SQL·ORM·Alembic 0002에는
아직 반영하지 않았고 운영 DB에도 적용하지 않았습니다. 기본 스키마나 옛 다섯 테이블 구조만으로는
새 구조 검사를 통과하지 못하며, 저장소 불일치 시 로그인 503·보호 요청 401로 안전하게 거절합니다.
실제 PostgreSQL 연결·동시성·제약·롤백 검증은 승인된 전용 테스트 DB가 준비된 뒤 수행합니다.

## 1. 구현 상태와 확인한 팀 작업 (최초 구현 이력)

이 문서는 전예진 담당 JWT 생명주기 코드를 설명합니다. 인증은 신원 확인, 인가는
해당 작업을 해도 되는지 확인하는 과정입니다. 이번에 실제 API·서비스와 PostgreSQL
저장소 코드를 추가했습니다. **실제 DB 연결·운영 스키마 적용·BFF 연결까지 완료한 상태는 아닙니다.**

2026-10-26 공식 저장소 최신 `develop`의 `364493c`(PR #31 병합)에서
`feature/backend-jwt-lifecycle-yejin`을 생성했습니다. 시작 시 작업 트리는 깨끗했습니다.

- 최초 구현 때 CRA-14 SQL은 미공유였으나 현재 PR #33은 원격 develop의 `3d71af9`에 병합됐습니다.
  원격 SQL을 읽기 전용으로 비교했으며 작업 트리에 Merge하거나 기존 스키마를 수정하지 않았습니다.
- 도메인 PR #30, `feat/api-domain-rules`의 `498d904`를 읽었습니다.
  이메일 소문자·앞뒤 공백 제거, 비밀번호 길이 규칙과 JWT 기반 소유자 정책을 확인했습니다.
  도메인 PR #30도 원격에는 병합됐지만 현재 브랜치에 병합하거나 파일을 수정하지 않았습니다.
- PR #33에는 users·revoked_tokens와 별도 admins가 있습니다. 회원 활성 상태와 Refresh 계열 테이블은
  여전히 없습니다. 차이·스키마 가드·Draft PR 차단 항목은 [최종 리뷰](JWT_LIFECYCLE_REVIEW.md)를 참고합니다.
- 안전한 별도 테스트 DB 접속 정보가 없으므로 운영 DB나 열린 로컬 5432 포트를 테스트 DB로
  간주하지 않았습니다. DB 생성·테이블 변경·실제 데이터 변경은 실행하지 않았습니다.

## 2. API 계약

기본 접두사는 `/api/v1`입니다. BFF가 내부 호출할 때 기존 `X-Aura-BFF-Key`가 필요하며,
직접 호출은 서버에 허용한 Origin을 사용해야 합니다. 모든 응답은 기존 요청 ID·보안 헤더와
`private, no-store`를 유지합니다.

### 로그인: POST /api/v1/auth/login

```json
{ "email": "member@example.com", "password": "<비밀번호>" }
```

서버는 정규화한 이메일로 회원을 조회하고 Argon2id(아르곤투아이디) 해시를 검증합니다.
알 수 없는 이메일에도 무작위 더미 해시 검증을 수행하지만 실제 더미 회원을 인증하지 않습니다.
사용자 없음·비밀번호 오류·비활성 사용자에는 같은 공통 401을 반환합니다.
잘못된 입력 모델은 422이며 응답에 입력값을 넣지 않습니다.
평문·지원하지 않는 저장 해시는 비밀번호로 인정하지 않습니다.

성공하면 DB 트랜잭션 커밋 후 200을 반환합니다.

```json
{
  "accessToken": "<서명된 JWT>",
  "refreshToken": "r1_<난수>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 604800
}
```

이는 **FastAPI↔BFF 서버 간 토큰 응답 계약**입니다. 기존 Mock의 `Session` 응답과 다릅니다.
현재 BFF는 이 응답을 토큰 쿠키로 변환하지 않으므로 API_URL만 바꿔 운영 연결하면 안 됩니다.
쿠키·회원가입·사용자용 Session DTO는 이번에 발급하지 않습니다.

### 갱신: POST /api/v1/auth/refresh

```json
{ "refreshToken": "r1_<이전에 발급한 난수>" }
```

정상 토큰이면 200과 같은 형태의 새 토큰 쌍을 반환합니다. Access JWT를 이 본문에 넣어도
Refresh Token으로 사용할 수 없습니다. 잘못된·만료·폐기·사용 완료 토큰은 401입니다.
Refresh Token의 원문은 이 요청과 정상 발급 응답에서만 필요하며 DB에는 해시만 저장합니다.

### 로그아웃: POST /api/v1/auth/logout

`Authorization: Bearer <유효한 Access JWT>`를 보내며 본문은 필요하지 않습니다.
검증된 jti에 연결된 토큰 계열을 서버에서 찾으므로 다른 사용자의 refreshToken·userId를
클라이언트로부터 받을 필요가 없습니다. DB 폐기 커밋 후 **204, 본문 없음**을 반환합니다.
만료·이미 폐기된 Access Token은 401이며, DB 저장 실패는 503으로 완료를 보고하지 않습니다.
Access Token이 만료된 상태에서 로그아웃하는 BFF 흐름은 선행 갱신 등 후속 정책이 필요합니다.

## 3. 발급·회전·폐기 흐름

Access JWT는 기존 HS256 검증 정책과 일치하며 `sub`, `jti`, `iat`, `exp`, `iss`, `aud`만 담습니다.
jti는 새 UUID입니다. 이메일·이름·주소·비밀번호·Refresh Token은 담지 않습니다.
권한 클레임도 임의로 추가하지 않으므로 발급된 사용자의 권한 집합은 기본적으로 비어 있습니다.
`CurrentUser` 보호 경로는 사용할 수 있지만 권한이 필요한 업무는 우섭님과 매핑 규칙을 연결해야 합니다.

Refresh Token은 `r1_` 접두사와 48바이트 난수를 URL-safe 인코딩한 불투명 토큰입니다.
JWT로 만들지 않아 Access/Refresh 용도를 구분하고 서버에서 일회 사용·폐기를 관리합니다.
DB에는 `SHA-256("aura-refresh-v1:" + 원문)`만 저장합니다. 난수는 384비트이며 비밀번호처럼
낮은 엔트로피 값이 아니므로 빠른 해시를 사용합니다. 비밀번호에는 별도로 Argon2id를 사용합니다.

```text
로그인 → 비밀번호·활성 상태 확인 → 새 family/Access/Refresh 준비
  → 활성 상태 재확인 + 해시·Access 메타데이터 저장 → 커밋 → 토큰 응답

갱신 → Refresh 해시 검색 → 사용자 잠금 → family 잠금 → Refresh 행 잠금
  → 유효성 확인 → 기존 토큰 consumed 표시 + 새 토큰 해시·메타데이터 저장
  → 한 트랜잭션 커밋 → 새 토큰 응답

로그아웃 → 기존 JWT·폐기 검사 → 사용자 잠금 → family 잠금
  → family/Refresh 폐기 + 유효한 Access jti들을 revoked_tokens에 기록
  → 한 트랜잭션 커밋 → 204 → 후속 BFF가 쿠키 삭제
```

잠금은 PostgreSQL `FOR SHARE`, `FOR UPDATE`를 사용합니다. 순서는 사용자 → 계열 → Refresh로
통일합니다. 대기 후 Refresh 행을 다시 읽으므로 같은 토큰의 두 요청이 모두 성공하지 않습니다.
재사용을 발견하면 계열 전체를 폐기하고 **그 폐기 트랜잭션을 커밋한 뒤** 401을 반환합니다.
예외를 먼저 발생시켜 폐기가 롤백되는 흐름을 피했습니다.

보수적 재사용 정책이므로 동시 갱신 중 첫 요청만 200이어도 두 번째 요청이 계열을 폐기해
첫 응답의 새 토큰도 사용할 수 없게 됩니다. BFF는 계열별 갱신을 하나로 모으는 처리가 필요합니다.
커밋 후 네트워크 응답을 잃고 예전 토큰을 재시도하는 경우에도 재로그인이 필요할 수 있습니다.

회전 시 Refresh 만료시간은 새 발급 시각부터 설정 수명만큼 연장됩니다(슬라이딩 만료).
정상 회전만으로 기존 Access를 폐기하지는 않습니다. 기존 Access도 자체 exp까지 유효하며,
로그아웃이나 재사용 감지 시에는 계열의 미만료 Access를 함께 폐기합니다.
별도 절대 로그인 최대 수명은 아직 구현하지 않았습니다. 계열별 최대 수명은 팀 합의가 필요합니다.

폐기 조회는 실제 저장소가 알려진 Access jti·활성 사용자·미폐기 계열·차단 목록을 확인합니다.
해당 DB에 발급 기록이 없는 jti도 거절합니다. 예전 임의 발급 JWT를 자동 수용하지 않습니다.
조회 오류는 기존 Fail Closed(페일 클로즈드, 확인할 수 없으면 거절)로 401입니다.
로그인·갱신·로그아웃 저장 오류는 503이며 정상 토큰 응답이나 로그아웃 완료를 반환하지 않습니다.

## 4. 파일 역할

- [api/auth.py](../../apps/api/aura_api/api/auth.py): 세 API·입력 검증·응답 계약.
- [identity/service.py](../../apps/api/aura_api/identity/service.py): 비밀번호 확인과 생명주기 조합.
- [identity/tokens.py](../../apps/api/aura_api/identity/tokens.py): JWT·불투명 토큰 발급, 해시, 자료 구조.
- [identity/repository.py](../../apps/api/aura_api/identity/repository.py): 저장소 인터페이스와 미연결 거절 구현.
- [identity/postgres.py](../../apps/api/aura_api/identity/postgres.py): 매개변수화 SQL·트랜잭션·행 잠금.
- [identity/schema_contract.py](../../apps/api/aura_api/identity/schema_contract.py): 읽기 전용 구조 검사와
  호환되지 않는 스키마의 안전한 거절. DDL을 실행하지 않습니다.
- [core/auth.py](../../apps/api/aura_api/core/auth.py): 기존 검증을 `decode_claims`로 공유하고 폐기 검사는 유지.
- [core/revocation.py](../../apps/api/aura_api/core/revocation.py): 앱 저장소를 기존 폐기 인터페이스에 연결.
- `main.py`, `config.py`, `api/router.py`: 설정·의존성·라우트 연결. 앱 시작 시 DB 연결·DDL은 하지 않습니다.
- [test_lifecycle.py](../../apps/api/tests/test_lifecycle.py): API 단위 테스트와 선택적 PostgreSQL 검사.
- [테스트 SQL](../../apps/api/tests/sql/auth_contract.sql): 승인 대기 컬럼 계약의 **테스트 픽스처**.
  운영 마이그레이션이 아니며 `apps/api/db/schema.sql`을 대신하지 않습니다.

운영 앱은 `AURA_DATABASE_URL`이 있으면 PostgreSQL 어댑터, 없으면 실패하는 저장소를 사용합니다.
메모리 구현은 테스트 파일에만 있습니다. BFF와 도메인 브랜치는 수정하지 않았습니다.

## 5. CRA-14에 요청할 DB 계약 — 확정 스키마 아님

아래 이름은 저장소 코드·테스트를 작성하기 위한 **잠정 계약**이며 CRA-14 확인 후 조정해야 합니다.
ERD·팀원 SQL을 덮어쓰거나 실행 가능한 운영 마이그레이션으로 확정하지 않았습니다.

| 테이블              | 필요한 항목                                                                                                                | 현재 확인·차이                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| users               | id UUID, email, password_hash, is_active BOOLEAN NOT NULL                                                                  | ERD에 앞 세 항목만 있음. is_active 또는 동등한 활성 상태 계약 필요 |
| revoked_tokens      | jti UUID PK, expires_at TIMESTAMPTZ NOT NULL                                                                               | SQL·ORM·0001 기준 UUID 일치. 실제 DB는 미검증                      |
| refresh_tokens      | id UUID PK, user_id, family_id, token_hash, created_at, expires_at, consumed_at, revoked_at, access_jti, access_expires_at | Access 발급 기록을 통합한 신규 계약. SQL·ORM·0002 반영 대기        |
| auth_token_families | id UUID PK, user_id, created_at, revoked_at                                                                                | 계열 잠금·재사용 폐기에 필요한 잠정 보조 테이블                    |

필요 제약·인덱스:

- `lower(users.email)` 유일 인덱스, Argon2id 해시를 담는 password_hash.
- 사용자·계열 외래키, `(family_id, user_id)` 일치 제약으로 사용자 혼동 방지.
- Refresh `token_hash` UNIQUE(64자리 16진수), 독립 토큰 식별자 PK, `expires_at > created_at`.
- Refresh `access_jti` UUID NOT NULL UNIQUE, `access_expires_at` TIMESTAMPTZ NOT NULL,
  `access_expires_at > created_at`. API 발급 시 두 토큰을 한 쌍으로 저장합니다.
- 격리 테스트 SQL에는 미소비·미폐기 행의 family_id 부분 UNIQUE도 둡니다.
  `consumed_at IS NULL AND revoked_at IS NULL`이며 기존 행 소비 처리 후 새 행을 삽입합니다.
  구조 가드는 주요 컬럼·PK·FK·비부분 UNIQUE를 검사하며 CHECK·부분 인덱스까지 보장하지 않습니다.
- family_id 조회 인덱스, 만료 정리용 expires_at 인덱스, jti PK 충돌 방지.
- 소비·폐기된 Refresh 기록을 즉시 지우면 재사용을 탐지하지 못합니다. 보존·정리 정책 필요.
- 같은 계열이 살아 있는 동안 소비된 Refresh 행도 보존해야 합니다. 정리는 계열 전체의
  Refresh·Access가 모두 만료된 후 계열 잠금 아래 재확인하는 방식을 추천합니다. 정리 작업은 미구현입니다.
- `revoked_tokens`는 원래 JWT exp까지 반드시 유지합니다. 정리 작업은 이번에 구현하지 않았습니다.
- 현재 단일 issuer·UUID jti 계약입니다. 다중 발급자, users.role의 권한 매핑은 후속 합의입니다.

## 6. 환경 변수와 비밀값

기존 JWT 네 설정은 모두 필요하며 기본 비밀키는 없습니다. 키를 BFF 공유 키와 분리합니다.

| 변수                                                                         | 기본값·정책                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| AURA_DATABASE_URL                                                            | 미설정. 명시적인 PostgreSQL URL만 허용, 접속 실패 시 대체 저장소 없음 |
| AURA_JWT_ALGORITHM, AURA_JWT_SIGNING_KEY, AURA_JWT_ISSUER, AURA_JWT_AUDIENCE | 기존 JWT 정책 유지                                                    |
| AURA_JWT_ACCESS_TTL_SECONDS                                                  | 900초, 서버 설정으로 변경 가능(1~86400)                               |
| AURA_REFRESH_TOKEN_TTL_SECONDS                                               | 604800초, 서버 설정으로 변경 가능(1~7776000)                          |
| AURA_CSRF_ALLOWED_ORIGINS / AURA_BFF_SHARED_KEY                              | 기존 출처 검사·BFF 서버 간 호출 정책 유지                             |

15분·7일은 이번 구현의 변경 가능한 기본값이며 팀의 운영 수명을 확정한 것은 아닙니다.
TLS·비밀값 주입·키 회전과 Argon2id 비용·로그인 빈도 제한은 인프라 담당자와 맞춰야 합니다.
새 로그는 추가하지 않았습니다. 비밀번호·토큰·DB URL을 로그로 남기지 않고 저장소 오류는
일반 오류로 바꿉니다. 정상 토큰 응답은 의도적으로 원문을 담으므로 프록시·BFF의 본문 로그도 금지해야 합니다.
운영 DB 스키마 확인 전에는 URL을 설정해 준비 완료로 간주하지 마세요.

## 7. BFF 후속 연결

현재 BFF 로그인은 Mock의 Session DTO를 기대하며 Refresh 경로도 없습니다.
FastAPI 토큰 JSON을 그대로 브라우저로 프록시하면 안 됩니다. 정민님과 다음을 연결해야 합니다.

1. BFF 서버가 로그인 응답을 받아 토큰을 HttpOnly·Secure·host-only 쿠키로 설정합니다.
   제안은 Access Path=/, Refresh Path=/api/auth, SameSite=Lax이며 운영 출처 정책과 함께 확정합니다.
   localStorage에 토큰을 저장하지 않습니다.
2. BFF는 Access 쿠키에서만 FastAPI Authorization을 만들고 브라우저 임의 헤더는 복사하지 않습니다.
3. Refresh 쿠키를 서버에서 읽어 refreshToken 본문으로 전달하고, 성공한 두 토큰을 함께 교체합니다.
   동일 계열의 갱신 요청을 직렬화하고, 임의 자동 재시도·무한 갱신 루프를 만들지 않습니다.
4. 기존 Origin·Fetch Metadata·BFF 공유 키·본문 제한·요청 ID와 브라우저 CSRF 보호를 유지합니다.
5. 원격 로그아웃 204를 확인한 뒤 Access/Refresh 쿠키를 발급 때와 같은 Path로 삭제합니다.
   DB 실패를 쿠키 삭제만으로 로그아웃 성공으로 바꾸면 안 됩니다.
6. 보호 요청의 401에서 갱신까지 실패하면 사용자·사용자별 캐시를 초기화하고 미인증 UI로 전환합니다.
   이 로컬 초기화를 원격 폐기 완료와 혼동하지 않습니다. 로컬 장바구니 정책은 유지합니다.

FastAPI는 이번에 쿠키를 설정하지 않습니다. BFF 회원 정보·guestId·Session DTO·Refresh 흐름,
401 헤더와 갱신/로그아웃 UX는 후속 작업입니다. 실제 브라우저 통합 검증도 아직 하지 않았습니다.

## 8. 테스트와 미검증 범위

```sh
npm run check:api
git diff --check
git status -sb
```

Access 기록 통합 후 Python 3.14.6·uv 기준 `npm run check:api`: **443개 통과, 44개 건너뜀,
0개 실패**이며 린트·포맷도 통과했습니다. 기존 428개 통과를 유지하고 신규 오프라인 검사
15개가 통과했습니다. 집중 검사(생명주기·구조·SQL 계약)는 68개 통과, 29개 건너뜀입니다.
같은 회원의 계열 분리, 소비·만료된 Refresh에 연결된 Access 유지와 로그아웃, 미등록 jti 거절을
검사했습니다. PostgreSQL 어댑터의 SQL 계약 검사는 연결 대역으로 바인딩·조회 조건을 확인하며,
실제 SQL 실행·행 잠금·DB 롤백을 검증한 것이 아닙니다. 승인된 전용 DB가 없어 실제 DB 검사는
실행하지 않았습니다. 빌드는 통과했고 전체 check는 수정하지 않은 파일 247개의 포맷 경고로
중단됐습니다. SQL·ORM·0002와 실제 DB 호환 여부는 우섭님 반영 후 재검증해야 합니다.

이하 내용은 최초 구현 당시의 과거 검증 기록입니다.

2026-10-26 Python 3.14.6·기존 uv 환경에서 `npm run check:api`의 린트·포맷 검사를 통과했고
**297개 통과, 24개 건너뜀, 0개 실패**를 확인했습니다. 기존 271개 회귀와 새 단위 검사
26개가 통과했습니다. 건너뛴 항목은 DB별 매개변수화된 실제 PostgreSQL 필요 사례입니다.
초기 추가 테스트의 긴 SQL 문자열 한 줄은 Ruff 지적 후 수정했고 최종 검사는 통과했습니다.
테스트는 실제 Argon2id와 JWT 서명을 사용하지만
기본 API 생명주기 테스트의 저장소는 테스트 전용 대역입니다. 이 결과로 PostgreSQL 행 잠금·
실제 커밋·롤백·SQL/팀 스키마 호환이 검증됐다고 주장하지 않습니다.

추가 검증에서 프로덕션 빌드는 통과했습니다. 전체 `npm run check`는 이번에 변경하지 않은
204개 파일의 기존 Prettier 포맷 경고에서 중단됐습니다. 해당 파일은 변경하지 않았고,
이번 Python 파일은 Ruff, 수정한 문서 세 개는 Prettier 검사로 통과를 확인했습니다.
문서 상대 링크와 `git diff --check`도 통과했습니다. BFF 소스를 변경하지 않아 웹 테스트·E2E는
별도 실행하지 않았습니다.

PostgreSQL 테스트는 사용자가 승인한 별도 DB의 `AURA_TEST_DATABASE_URL`과
`AURA_ALLOW_DATABASE_TESTS=1`이 **모두** 있어야 실행합니다. 앱 DB URL이나 로컬 기본 DB를
자동 사용하지 않습니다. 실행하면 무작위 전용 스키마를 생성·정리하므로 전용 테스트 DB에서만
명시적으로 허용해야 합니다. Windows 테스트는 Selector 이벤트 루프를 사용합니다.
이번에는 두 설정이 없어 DB 테스트를 건너뛰며 DB 생성이나 삭제를 실행하지 않습니다.

선택적 실제 DB 테스트에는 동일한 로그인·갱신·동시 회전·로그아웃 사례와
부분 쓰기 후 오류의 트랜잭션 롤백 검증이 준비되어 있습니다. CRA-14 확정 후 테스트 SQL도
실제 스키마 기준으로 맞춰야 합니다. 현재 픽스처만 통과해도 CRA-14 호환 완료는 아닙니다.

## 9. 설계서 대비와 팀 협업

- JWT Access 필수 6개 클레임·서명·jti 차단 인터페이스: PR #31 재사용.
- 로그인·Access 발급·불투명 Refresh 발급/해시·검증·회전·재사용 계열 폐기: API·서비스 구현.
- PostgreSQL 지속 저장·잠금·실제 폐기 조회: 어댑터 구현, 운영 스키마·DB 검증 대기.
- 로그아웃 시 Access/Refresh 폐기: 트랜잭션 코드·단위 검증 구현, 실제 DB 기록 성공 검증 대기.
- Refresh가 이번 요청으로 필수가 된 점을 반영했습니다. 가입·비밀번호 재설정·키 회전·운영 정리 작업은 제외합니다.
- 우섭님: CRA-14의 실제 컬럼·role·활성 상태와 현재 잠정 테이블 계약, 도메인 Credentials 재사용,
  비밀번호 변경·탈퇴 시 토큰 전체 무효화 정책을 맞춥니다.
- 다라님: 안전한 테스트 DB·연결 정보·마이그레이션 적용 순서·DB 계정 권한·TLS·풀·로그 보호를 맞춥니다.
  현재는 요청마다 별도 연결이며 운영 연결 풀·계정/서버 빈도 제한은 후속 과제입니다.
- 정민님: FastAPI TokenPair와 기존 Session 응답 차이, 토큰 쿠키·Bearer·갱신·401·로그아웃을 연결합니다.

참고: [JWT 인증·인가](AUTHORIZATION_CORE.md), [BFF 계약](../FASTAPI_BFF.md),
[Psycopg 비동기 연결](https://www.psycopg.org/psycopg3/docs/advanced/async.html),
[PostgreSQL 행 잠금](https://www.postgresql.org/docs/current/explicit-locking.html),
[Argon2 비밀번호 검증](https://argon2-cffi.readthedocs.io/en/stable/howto.html).
