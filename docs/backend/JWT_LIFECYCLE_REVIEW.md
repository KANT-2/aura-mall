# JWT 생명주기 최종 리뷰 및 Draft PR 미완료 항목

검토일: 2026-10-26. 브랜치: `feature/backend-jwt-lifecycle-yejin`.
**코드·오프라인 테스트 준비와 실제 DB·BFF 연계 완료를 구분합니다. 현재 배포 준비 완료 상태는 아닙니다.**

## 진행 중인 develop 병합 보완 (2026-10-26)

- JWT 작업 커밋 `1a7980b`와 병합 대상 `a69c330`을 보존합니다. 사용자가 시작한 병합의 충돌을 해결하며 최종 병합 커밋은 만들지 않습니다.
- `main.py`는 JWT 검증기·저장소·서비스와 SQLAlchemy 세션 팩토리를 함께 초기화합니다. lifespan(라이프스팬, 앱 실행 수명)의 finally에서 엔진을 정리합니다.
- 자동 병합된 config의 중복 DB 설정·검증기를 제거했습니다. `postgres://`, `postgresql://`, `postgresql+asyncpg://`를 검증하고 SQLAlchemy에는 asyncpg 드라이버 URL, JWT psycopg 저장소에는 PostgreSQL URL을 전달합니다. 비밀번호를 로그로 출력하지 않습니다.
- SQLAlchemy의 요청별 세션은 기존 `get_session`이 종료합니다. JWT 저장소는 별도 psycopg 연결·트랜잭션을 유지합니다. 두 방식이 하나의 트랜잭션을 공유하는 것은 아니며 향후 도메인 연계 시 정리가 필요합니다. 드라이버별 query 옵션(예: SSL)의 배포 호환성은 실제 연결 환경에서 추가 확인해야 합니다.
- Alembic·asyncpg·SQLAlchemy와 Argon2id·PyJWT·psycopg 의존성을 함께 유지하고 `uv lock`으로 재생성했습니다.
- BFF의 쿠키→Bearer·401 처리 구현은 보존합니다. BFF 기대 계약은 Session+쿠키, 백엔드는 TokenPair JSON·로그아웃 204이므로 응답 어댑터가 필요합니다. 백엔드 Refresh는 구현됐으나 BFF 자동 갱신은 미구현입니다.
- BFF 테스트 전용 앱의 로그인·로그아웃이 새 운영 경로보다 먼저 선택되도록 테스트 앱 안에서만 등록 순서를 조정했습니다. 운영 라우팅·BFF 소스는 변경하지 않았습니다.
- 최신 SQL·ORM에도 `users.is_active`, `refresh_tokens`, `auth_token_families`, `auth_access_tokens`가 없습니다. 스키마·마이그레이션은 변경하지 않았습니다. 기존 가드와 기본 거부 정책을 유지합니다.
- 이하 PR #33 시점 기록은 과거 검토 이력이며 현재 병합·BFF 현황과 구분합니다.

### 병합 검증 기록

- API 린트·포맷 통과, **396개 통과 / 30개 건너뜀 / 0개 실패**. 앱 조합·종료 및 BFF 테스트 경로 회귀 6개를 추가했습니다.
- `AURA_TEST_DATABASE_URL`을 검사 프로세스에서 제거하고 DB 테스트 허용을 비활성화했습니다. DB 전용 4개와 기존 생명주기 건너뜀 26개는 실제 PostgreSQL 검증 완료를 뜻하지 않습니다.
- `npm run build` 통과. 전체 `npm run check`는 이번 보완에서 수정하지 않은 파일 245개의 포맷 경고로 중단됐습니다. 해당 파일은 일괄 변경하지 않았습니다.
- `npm run check:web` 통과: 웹 린트·CSS·타입 검사와 테스트 106개 통과. JWT BFF E2E 3개도 통과했습니다. E2E는 테스트 전용 FastAPI 앱을 사용하며 실제 PostgreSQL 생명주기·Refresh API 연동 검증은 아닙니다.

## 1. 기준과 변경 보존 (병합 전 기록)

- 기존 미커밋 변경을 보존했습니다. fetch만 수행했고 stash·reset·merge·commit·push는 하지 않았습니다.
- 확인한 원격은 `origin/develop`의 `3d71af9bacf4c242d18bac17d175426ab77bbf1a`, PR #33입니다.
- 현재 브랜치 기준 커밋은 PR #31 시점으로 원격보다 3개 커밋 뒤에 있습니다. 자동 동기화하지 않았습니다.
- 원격 [schema.sql](https://github.com/KANT-2/aura-mall/blob/3d71af9bacf4c242d18bac17d175426ab77bbf1a/apps/api/db/schema.sql)을
  읽었으며 기존 SQL·seed·도메인·관리자 코드를 수정하지 않았습니다.

## 2. 구현 여부와 안전성

| 항목         | 코드에서 확인한 사항                                                                   | 검증의 한계                                                 |
| ------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 로그인·발급  | 이메일 정규화, Argon2id 검증, 활성 상태 확인, 최소 JWT 6개 클레임, 불투명 Refresh 발급 | 실제 회원 DB·스키마 연결 전                                 |
| Refresh 저장 | 원문 대신 SHA-256 해시, 독립 ID·사용자·계열·만료·소비/폐기 상태                        | 실제 SQL 영속화 미검증                                      |
| 회전         | 사용자 → 계열 → Refresh 순서 잠금, 기존 소비와 새 해시 저장을 같은 트랜잭션으로 처리   | 동시 성공 방지는 대역으로 확인, 실제 PostgreSQL 잠금 미검증 |
| 재사용       | 사용 완료 토큰이면 계열 전체 폐기 후 커밋하고 401                                      | 정상 클라이언트의 병렬 요청도 재로그인이 필요해질 수 있음   |
| 로그아웃     | 검증된 사용자·jti로 계열 조회, Refresh·미만료 Access 함께 폐기, 커밋 뒤 204            | 실제 폐기 기록·부분 실패 롤백 미검증                        |
| 실패 처리    | 조회 불가 401, 저장 실패 503, 실패를 로그인·로그아웃 성공으로 바꾸지 않음              | 실제 장애·네트워크 단절 검증 필요                           |
| 관리자 분리  | 고객 조회는 users만 사용, admins로 대체하지 않음, 관리자 권한 자동 발급 없음           | 관리자용 JWT/API 자체는 이 작업 범위가 아님                 |

일반 회원의 발급 토큰에는 permissions를 임의로 넣지 않으며 기본 권한은 비어 있습니다.
`admins.status`나 관리자 이메일을 일반 회원의 활성 상태·권한으로 사용하지 않습니다.
관리자 전용 토큰·issuer/audience·키·쿠키 연결은 정민님·우섭님 담당 영역입니다.

### 리뷰에서 보완한 문제

PostgreSQL `now()`는 트랜잭션 시작 시각입니다. 회전이 계열 잠금을 기다리는 사이 Refresh가
만료돼도 기존 비교는 시작 시각으로 허용할 수 있어 `clock_timestamp()`로 보완했습니다.
잠금 대기 중 만료되는 실제 DB 회귀 사례는 준비했지만 아직 실행하지 않았습니다.
[PostgreSQL 시각 함수 설명](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)

메타데이터의 제약 종류는 text로 읽고, 검증 완료된 제약과 유효한 비부분 UNIQUE 인덱스만
가드에 사용합니다. 가드는 주요 컬럼·타입·NULL 허용·PK·소유 관계 FK·이메일/해시 UNIQUE를
확인합니다. 모든 CHECK·트리거·격리 수준·실행 권한·SQL 동작까지 검증하는 도구는 아닙니다.

## 3. PR #33과의 호환 및 차이

호환: users의 id UUID·email VARCHAR(254)·password_hash VARCHAR(255), lower(email) UNIQUE,
revoked_tokens의 jti UUID PK·expires_at TIMESTAMPTZ·만료 인덱스.

미완료: users에 활성 상태가 없고 refresh_tokens·auth_token_families·auth_access_tokens도 없습니다.
admins.status는 회원 상태의 대안이 아닙니다. 활성 상태·기존 회원 초기값과 인증 확장 구조를
우섭님과 합의해야 하며, 현재 스키마만으로 실제 로그인·회전·로그아웃을 운용할 수 없습니다.
가드는 업무 SQL 전에 거절하며 로그인 503·보호 요청 401·헬스 200을 유지합니다.
헬스 성공이 인증 저장소 준비 완료를 뜻하지 않습니다.

테스트용 users에는 PR #33의 필수 name과 marketing·created_at을 반영했습니다.
테스트 SQL의 병합된 기본 부분과 미승인 인증 확장을 구분했습니다. 운영 마이그레이션은 아닙니다.

## 4. 테스트 범위

최종 `npm run check:api`: **309개 통과, 26개 건너뜀, 0개 실패**. 린트·포맷도 통과했습니다.
기존 271개 회귀, 생명주기 단위 검사 26개, 오프라인 스키마 검사 12개가 통과했습니다.
실제 DB 검사는 실행 환경에서 명시적으로 비활성화했습니다. 건너뛴 개수에는 DB별 매개변수화와
DB 전용 롤백·만료 경계 사례가 포함됩니다.
전체 `npm run check`는 변경하지 않은 204개 파일의 기존 포맷 경고에서 중단됐습니다.
수정 문서 포맷·`git diff --check`와 현재 브랜치의 프로덕션 빌드는 통과했습니다.
실제 Argon2id/JWT와 기존 오류·CSRF·XSS·헬스 회귀를 검사합니다.
API 동시 갱신은 테스트 전용 메모리 저장소, 구조 검사는 독립적인 PR #33 메타데이터 스냅샷과
연결 대역으로 확인합니다. PostgreSQL 연결 함수는 대체되며 실제 DB에는 접속하지 않습니다.
실제 DB의 로그인·저장·동시 잠금·폐기 기록·커밋/롤백·잠금 중 만료 사례는 건너뜁니다.
별도 DB와 명시적 실행 허용 전에는 테스트 픽스처의 CREATE/DROP도 실행하지 않습니다.

## 5. 충돌 가능성과 Draft PR 미완료 목록

원격과 현재 변경 경로의 교집합은 docs/FASTAPI_BFF.md입니다. 실제 병합 충돌 여부는 확인하지
않았습니다. 이후 승인된 동기화에서 PR #32 관리자 계약과 JWT TokenPair·204 계약을 모두 유지해야 합니다.
apps/api/db/_·도메인 modules/_·관리자/BFF 소스는 수정하지 않았습니다.

- 우섭님: 활성 상태·인증 확장 컬럼·제약·인덱스 승인과 저장소 계약 조정.
- 다라님: 승인된 전용 테스트 DB·계정 권한·연결 설정, 실제 동시성·롤백·만료 검사.
- 정민님: HttpOnly/Secure 쿠키·Bearer·갱신 직렬화·401·원격 폐기 후 쿠키 삭제 연결.
- BFF가 FastAPI 토큰 JSON을 그대로 브라우저로 전달하지 않도록 어댑터 구현.
- 만료된 Access로 로그아웃할 때의 선행 갱신·재인증 UX와 재시도 정책 합의.
- 토큰 수명·계열 절대 수명·권한 매핑·키 회전·빈도 제한·연결 풀 후속 검토.
- 최신 develop 동기화 후 도메인 입력 정규화 중복·계약 충돌·전체 회귀 재확인.

참고: [생명주기 구현](JWT_LIFECYCLE.md), [공통 인증](AUTHORIZATION_CORE.md), [BFF 계약](../FASTAPI_BFF.md).
