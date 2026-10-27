# CRA-22 인증·BFF 통합 보안 QA

검토일: 2026-10-27. 기준: develop `c56b8a5`.
작업 브랜치: `test/cra22-auth-security-qa`.

**완료 판정: 보류.** 신규 보안 회귀 테스트에서 결함 1건을 재현했습니다.
운영 구현은 변경하지 않았고 실패 테스트를 그대로 유지했습니다. 병합하면 안 되는 검토용 변경입니다.

## 기존 검증과 이번 작업의 구분

| 근거                                    | 이미 존재하는 범위                                                        | 이번 실행 여부                                |
| --------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| PR #42·#53, test_lifecycle.py           | 회원 발급·회전·재사용·폐기·동시 요청·삭제·장애·롤백                       | DB 없는 조합은 실행, PostgreSQL 조합은 건너뜀 |
| PR #50, tests/db/test_admin_auth_api.py | 관리자 로그인 실패·비활성화·폐기·만료·세션 소유자·회원/관리자 교차 접근   | DB 전용이므로 건너뜀                          |
| PR #54, tests/db/test_e2e_journey.py    | 실제 DB의 카탈로그→회원 로그인→레시피→주문→관리자 조회→교차 접근→로그아웃 | 코드·PR 설명만 확인, 이번에는 실행하지 않음   |
| BFF 통합 테스트                         | TokenPair 변환·보안 쿠키·401·CSRF·오류 은닉                               | 기존 웹 테스트 재사용                         |
| bff-jwt.spec.ts                         | 회원가입·로그인·조회·회전·재사용 차단·로그아웃·두 탭의 단일 갱신          | 기존 6개 재사용·통과                          |
| 신규 test_principal_boundaries.py       | 회원과 관리자 UUID가 같은 상황의 역할 경계                                | 9개 통과, 1개 실패                            |

PR #54의 실제 DB 결과는 해당 PR 작성자의 기존 기록입니다. 현재 환경에서 재검증한 결과가 아닙니다.
PR #54는 Next.js BFF나 브라우저를 통과하지 않는 API E2E입니다.
현재 JWT BFF E2E는 운영 인증 라우터·서비스·검증기와 실제 Next 서버를 사용하지만,
인증 저장소는 tests/fixtures/auth_storage.py의 대역입니다. 운영 배포나 PostgreSQL 검증이 아닙니다.
storefront_app.py도 DB 저장소를 대역으로 바꾸므로 실제 DB 근거로 사용하지 않습니다.

참고 PR: [#42](https://github.com/KANT-2/aura-mall/pull/42),
[#50](https://github.com/KANT-2/aura-mall/pull/50),
[#51](https://github.com/KANT-2/aura-mall/pull/51),
[#53](https://github.com/KANT-2/aura-mall/pull/53),
[#54](https://github.com/KANT-2/aura-mall/pull/54).

## 확인된 결함: 관리자 Token의 회원 프로필 접근

위험도: **중간**, 우선순위: **P1**. 일반적인 관리자→임의 회원 전체 접근으로 확대 해석하지 않습니다.

조건:

- users와 admins에 같은 UUID가 존재합니다. 두 테이블 PK는 각각 독립적입니다.
- 정상 발급된 관리자 JWT와 유효한 관리자 세션이 있습니다.
- 해당 UUID의 회원 프로필이 존재합니다.

재현 결과: 관리자 JWT로 GET /api/v1/auth/me 요청 시 기대한 401 대신 **200과 회원 프로필**을 반환합니다.
사용자·폐기 조회는 대역이며, 실제 DB에 동일 UUID 계정이 존재하거나 실제 개인정보가 유출됐다고 확인한 것은 아닙니다.
실제 JWT 서명 검증·운영 라우팅·회원 서비스 코드는 대역으로 바꾸지 않았습니다.

원인:

- aura_api/api/auth.py의 me()는 공통 CurrentUser 뒤에 principal_type·관리자 permissions를 검사하지 않습니다.
- identity/service.py의 me()는 sub를 회원 ID로 해석해 profile()을 조회합니다.
- 공통 폐기 저장소는 정상 관리자 세션도 허용합니다.
- 반면 api/deps.py의 optional_member()는 principal 표시를 검사하므로 recipes·orders는 동일 조건에서도 401입니다.

수정안(미적용): 회원 인증 API에도 기존 optional_member()와 같은 principal 차단 정책을 공유하고,
관리자 principal 또는 관리자 permission이면 회원 프로필 조회 전에 거절합니다.
공통 JWT 검증기에서 관리자 전체를 막으면 정상 관리자 API까지 깨지므로 그렇게 수정하지 않습니다.
회원·관리자 인증 담당자의 수정·리뷰와 실제 DB 동일 UUID 회귀가 필요합니다.

신규 실패 테스트를 skip이나 xfail로 숨기지 않았습니다. 현재 이 테스트 때문에 API 검사는 실패합니다.

## 추가로 남은 연동·환경 사항

- **관리자 BFF 인증 연결 미구현(P1):** FastAPI에는 /admin/auth/login, /admin/session,
  /admin/auth/logout이 있지만 Next의 app/api/admin에는 대응 인증 경로가 없습니다.
  AdminShell은 일반 useAccount()/useAuth()를 사용하고 BFF handleAuth는 회원 /auth/**를 호출합니다.
  관리자 Access 전용 응답과 회원 TokenPair는 다릅니다. 관리자 Cookie·상태·로그아웃 연동은
  조정민님 및 관리자 인증 담당자와 합의해야 합니다. 이번에는 수정하지 않았습니다.
- **실제 PostgreSQL 검증 불가:** Docker 명령과 표준 설치 경로의 실행 파일을 찾지 못했습니다.
  aura-jwt-test-db 컨테이너와 127.0.0.1:5434 매핑을 확인하지 못해 DB 테스트는 실행하지 않았습니다.
  테스트 프로세스에서 AURA_TEST_DATABASE_URL을 제거하고 AURA_ALLOW_DATABASE_TESTS=0을 지정했습니다.
  열린 포트나 기존 개발 DB를 전용 테스트 DB로 간주하지 않았습니다.
- **웹 설치 의존성 차이(P2):** package-lock.json의 Next.js는 16.4.3, 설치본은 16.4.2입니다.
  웹 검사·빌드·E2E 통과는 설치본에서의 결과입니다. 잠금 파일 기준 재설치 후 재검증이 남았습니다.
- 기존 Windows 이벤트 루프 설정에서 Python 3.16 제거 예정 DeprecationWarning 2건이 발생합니다.
  기존 코드에서 발생한 경고이며 이번에 변경하지 않았습니다.

## 실행 결과

| 실행                      | 결과                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| 변경 전 npm run check:api | 468 통과 / 0 실패 / 84 건너뜀, Ruff 통과                           |
| 변경 후 npm run check:api | **477 통과 / 1 실패 / 84 건너뜀**, Ruff·포맷 통과                  |
| 신규 테스트               | 정상 회원·관리자와 교차 경계 9개 통과, 관리자→회원 프로필 1개 실패 |
| npm run check:web         | 린트·CSS·타입 검사 및 웹 124개 통과                                |
| npm run test:e2e:jwt      | 6개 통과, 인증 저장소 대역 사용                                    |
| npm run build             | 통과, 설치된 Next.js 16.4.2 기준                                   |

`npm run check`는 이번에 변경하지 않은 258개 파일의 기존 포맷 경고로 중단됐습니다.
신규 문서는 Prettier를 적용했고 git diff --check도 통과했습니다. 기존 파일은 일괄 포맷하지 않았습니다.

변경 파일은 신규 테스트와 이 문서뿐입니다. 회원·관리자 구현, BFF, DB 스키마·ORM·마이그레이션,
인프라 설정은 수정하지 않았습니다. 테스트 전용 브랜치이므로 파일 충돌 가능성은 낮지만,
관리자 구현 변경 시 이 실패 사례를 해결했는지 함께 리뷰해야 합니다.

## CRA-22 완료 전 확인

1. 관리자 Token의 회원 프로필 접근 차단 수정과 실패 회귀 통과.
2. 지정 전용 컨테이너·포트·삭제 허용 DB를 확인한 뒤 기존 관리자·회원 PostgreSQL 테스트 재사용.
3. 관리자 BFF 인증의 구현 범위와 후속 업무 확정, 연결 후 실제 관리자 브라우저 E2E.
4. 잠금 파일과 일치하는 웹 의존성으로 재검증.

검토용 Draft PR은 준비할 수 있지만 실패 1건을 표시하고, 수정·리뷰 전 병합하지 않습니다.
