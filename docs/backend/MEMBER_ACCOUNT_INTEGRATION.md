# CRA-36 회원 관리 BFF·마이페이지 연결

## 범위와 CRA-7 확인

CRA-31·33·34의 FastAPI를 BFF와 마이페이지 계정 관리 탭에서 사용합니다. CRA-7은 진행 중이나
세 신규 회원 관리 BFF는 없었습니다. 원격 fix/bff-remaining-boundaries의 커밋은 git cherry에서
이미 develop에 동등 패치가 반영된 것으로 확인했습니다. 기존 로그인·등록·쿠키·관리자·업무
어댑터를 교체하지 않고 회원 동작과 관련 잠금만 확장했습니다.

**장바구니 삭제는 보류합니다.** 현재 cart-storage.ts는 소유자 구분 없이 aura_cart_v1 하나를
사용합니다. 계정 비활성화 때 이를 지우면 다른 회원·비회원 데이터까지 삭제할 수 있습니다.
CRA-7 담당자와 회원별 장바구니 키·전환·기존 데이터 이관 정책을 합의해야 합니다. 이번 작업은
장바구니 저장 구조를 바꾸거나 공용 키를 삭제하지 않습니다. CRA-36 전체 완료로 간주하지 않습니다.

## 공개 API

| BFF                            | 본문                         | 성공                               |
| ------------------------------ | ---------------------------- | ---------------------------------- |
| PATCH /api/auth/me             | name?, marketing?            | 200 AccountState { user, guestId } |
| POST /api/auth/change-password | currentPassword, newPassword | 204, 회원 쿠키 삭제                |
| DELETE /api/auth/me            | currentPassword              | 204, 회원 쿠키 삭제                |

회원 관리 BFF는 회원 Access 쿠키로 FastAPI GET /auth/me를 호출해 회원을 확인합니다.
브라우저 Authorization·사용자 ID로 인증하지 않습니다. 화면은 X-Account-Owner를 보내며
검증된 회원과 다르면 쓰기 전에 409 OWNER_CHANGED로 거절합니다. 관리자는 회원 동작에서
거절합니다. 프로필 응답은 공개 필드만 반환하고 비밀번호·해시·토큰은 반환하지 않습니다.

비밀번호 변경·비활성화는 백엔드 204만 성공입니다. 잘못된 200 등은 502로 처리하고 쿠키를
지우지 않습니다. 회원 Access의 Path=/, Refresh의 Path=/api/auth와 기존 HttpOnly·Secure·
SameSite 정책을 유지하며 관리자 쿠키는 삭제하지 않습니다. 400 CURRENT_PASSWORD_INVALID,
403·409·422·5xx에서는 자동 Refresh·쓰기 재시도를 하지 않습니다. 백엔드 503은 기존 BFF
계약에 따라 502로 전달합니다. 401은 기존 만료 토큰 갱신 정책을 따르며, Refresh 자체가
401로 거절되면 기존 계약대로 인증 쿠키를 삭제할 수 있습니다.

## 파일과 처리 흐름

- app/api/auth/me/route.ts와 change-password/route.ts: 명시적 PATCH·DELETE·POST 경로.
- server/bff/auth.ts: 기존 인증 어댑터에 회원 조회·소유자 충돌 검사·공개 DTO·204 처리를 추가.
- lib/api/client.ts: 회원 관리·기존 회원 인증의 요청/갱신/한 번 재시도를 같은 인증 잠금 안에서 처리.
- lib/api/auth-events.ts: 성공 뒤 같은 탭과 다른 탭에 비밀값 없는 캐시 무효화 신호를 전달.
- features/account/hooks/member-cache.ts와 app/providers.tsx: 해당 회원 개인 캐시 취소·정리,
  계정 재조회 및 포커스 복귀 시 재확인. 관리자·다른 회원 캐시는 유지.
- features/account/api/account.ts: 공개 BFF 호출. 비밀번호를 query key나 저장소에 넣지 않음.
- features/account/components/member-settings.tsx: 이름·마케팅 수정, 현재/새 비밀번호,
  계정 사용 중지 확인·입력 오류·처리 중·성공/실패 피드백. 비밀번호는 요청 후 비움.
- account-overview.tsx와 account.module.css: 기존 계정 탭·디자인 안에서 새 폼 표시.
- apps/api/tests/fixtures/auth_storage.py: 실제 FastAPI 서비스 E2E를 위한 저장소 대역만 보완.
  운영 인증 코드·DB 스키마·인프라는 수정하지 않음.

성공 전에는 개인 캐시를 정리하지 않습니다. 프로필은 계정 캐시를 갱신하고, 비밀번호 변경·
비활성화는 해당 owner의 orders/recipes 캐시만 취소·삭제합니다. 다른 탭은 storage 신호를 받아
현재 쿠키로 계정을 다시 조회합니다. 신호에는 owner·종류·임의 nonce만 포함하며 JWT·비밀번호·
프로필은 포함하지 않습니다. localStorage 사용이 불가능하면 다른 탭 즉시 알림은 보장하지 않지만
창 포커스 복귀 시 계정을 재조회합니다.

## 인증 경쟁과 한계

기존 aura-jwt-auth Web Lock을 사용합니다. 잠금을 가진 동작의 내부 Refresh는 잠금을 중복
획득하지 않아 교착을 피합니다. Web Locks가 없으면 같은 탭에서는 Promise 큐로 직렬화하지만
다른 탭 간 직렬화는 보장하지 않습니다. 폼의 ref 잠금·disabled 상태로 중복 제출을 막습니다.
관리자 인증은 별도 잠금과 쿠키를 유지합니다.

X-Account-Owner는 오래된 폼으로 다른 계정을 수정하는 일을 막는 보조 조건입니다. 이 값으로
회원 인증을 대체하지 않습니다. 브라우저 잠금은 해당 클라이언트 흐름을 직렬화할 뿐 서버·DB
트랜잭션을 대체하지 않습니다. 백엔드의 회원·계열·토큰 잠금은 그대로 유지됩니다.

## 남은 정책과 검증 범위

비활성화는 개인정보 완전 파기가 아닙니다. 주문 개인정보 보존·재가입·복구·정지와 탈퇴 구분은
확정하지 않습니다. 관리자 쿠키·다른 회원 데이터·공용 장바구니는 보존합니다.
기존 기본 Mock 서버에 새 회원 관리 API를 추가하지 않았으므로 신규 기능은 실제 FastAPI
연결 환경이 필요합니다. Mock의 기존 로그인·업무 흐름은 회귀 검사합니다.

테스트용 FastAPI/BFF E2E는 실제 라우터·JWT 검증·Argon2id·서비스와 Next 프로덕션 서버를
사용하지만 저장소는 메모리 대역입니다. 이번에는 실제 PostgreSQL·배포 환경을 검증하지 않습니다.
임시로 이전 빌드를 사용한 E2E와 Next 기본 alert에 겹친 테스트 선택자 문제는 새 빌드와
회원 관리 영역으로 제한한 선택자로 수정한 뒤 재검증했습니다.

### 최초 구현 65a63f5의 검증

2026-10-27 최초 구현 당시 실행 결과입니다. 최신 통합 결과는 다음 절에 기록합니다.

| 검사                         | PASS | FAIL | SKIP |
| ---------------------------- | ---: | ---: | ---: |
| 전체 API pytest, DB 비활성화 |  588 |    0 |  173 |
| 웹 단위·HTTP 통합 테스트     |  169 |    0 |    0 |
| JWT·회원 관리 BFF/UI E2E     |    8 |    0 |    0 |
| 기존 업무·관리자 BFF E2E     |    7 |    0 |    0 |

Ruff·Python 116개 파일 포맷, 웹 lint·CSS 검사·타입 검사와 프로덕션 빌드가 통과했습니다.
회원 수정과 다른 탭 반영, 잘못된 비밀번호 400과 쿠키 유지, 변경 성공 뒤 두 탭의 로그아웃,
새 비밀번호 로그인, 비활성화와 관리자 쿠키 보존, 422 입력 오류를 검증했습니다.
HTTP 통합 검사는 비밀 필드 제거·계정 충돌 409·관리자 거절·400/401/403/422/5xx/잘못된
성공 상태에서 쿠키 유지, 단위 검사는 잠금 내부 갱신과 같은 탭 대체 큐·소유자별 캐시 경계를
검증합니다. 초기 테스트의 JSON Content-Type 누락은 테스트 요청에서 수정했습니다.

최초 구현 때 루트 npm run check는 당시 develop의 .github/workflows/cd.yml
57행 부근 YAML 문법 오류와 기존 Prettier 경고로 중단됐습니다. 당시 로컬 빌드는 Next.js
16.4.2에서 수행했습니다. 아래 통합에서 PR #64의 문법 수정과 잠금 버전 설치를 반영했습니다.

### 최신 develop 통합 및 PR 제출 전 검증

2026-10-27 origin/develop 3ab8435를 CRA-36 브랜치에 통합했습니다.

- PR #64: CD YAML 들여쓰기 수정. 인프라 코드를 별도로 고치지 않고 원본 변경을 반영했습니다.
- PR #65: 입점 문의 요청 제한·마이그레이션 0004·관련 테스트와 문서를 보존했습니다.
- PR #66: DELETE /api/v1/auth/me와 POST /api/v1/auth/change-password의 operation 스냅샷을 반영했습니다.
- 실제 충돌은 없었고 docs/FASTAPI_BFF.md는 자동 병합됐습니다. 회원 관리 계약과 입점 문의
  제한 설명을 모두 유지했습니다. 운영 인증 코드·PR #62 계정 비활성화 구현은 origin/develop과
  동일하며, CRA-36의 BFF·마이페이지·쿠키·캐시·인증 잠금 구현도 유지했습니다.
- 최초 계약 검사에서 openapi-typescript가 로컬에 없어 실행하지 못했습니다. npm ci --ignore-scripts로
  기존 잠금 파일에 맞춰 설치했으며 package.json과 package-lock.json은 변경하지 않았습니다.

| 최종 검사                          | PASS | FAIL | SKIP |
| ---------------------------------- | ---: | ---: | ---: |
| 전체 API pytest, DB 비활성화       |  589 |    0 |  175 |
| 웹 단위·HTTP 통합 테스트           |  169 |    0 |    0 |
| JWT·회원 관리 BFF/UI E2E           |    8 |    0 |    0 |
| 업무·관리자 FastAPI BFF E2E        |    7 |    0 |    0 |
| 장바구니 Mock E2E, 데스크톱·모바일 |   10 |    0 |    0 |

Ruff·Python 117개 파일 포맷·웹 lint·CSS·타입 검사·git diff --check가 통과했습니다.
check:contract는 계약 1.0.0의 34개 operation과 공개 DTO 타입을 검증했습니다.
프로덕션 빌드와 E2E는 선언/잠금과 같은 Next.js 16.4.3에서 통과했습니다.
회원 수정·다중 탭·비밀번호 변경·계정 비활성화·관리자 쿠키·주문·레시피를 검증했고,
기존 장바구니의 인증 전후 보존·다중 탭 수량/삭제·다른 브라우저 분리도 확인했습니다.

CD YAML 문법 오류는 해소됐습니다. 루트 npm run check는 남아 있는 기존 274개 파일의 Prettier
경고로 포맷 단계에서 중단됩니다. 인프라 YAML에는 포맷 경고가 남아 있으나 별도 담당 영역으로
두고 일괄 포맷하지 않았습니다. 이번 통합 보고 문서와 BFF 계약 문서만 포맷했습니다.

실제 PostgreSQL·배포 연동과 마이그레이션 실행은 하지 않았습니다. API 건너뜀에는 DB 전용
검사가 포함되며 E2E의 저장소는 테스트 대역입니다. 장바구니 소유 정책 합의·탈퇴 시 삭제는
여전히 보류하며 공용 키를 삭제하지 않습니다. 따라서 통합 회귀 검증 통과와 CRA-36 전체
완료를 구분하고, 위 남은 항목을 PR 리뷰에 명시합니다.
