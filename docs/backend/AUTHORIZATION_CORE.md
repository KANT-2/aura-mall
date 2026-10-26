# AURA 공통 인증·인가 기반

## 1. 인증과 인가

인증(Authentication, 오센티케이션)은 “누구인가?”를 확인하는 과정입니다.
인가(Authorization, 오서라이제이션)는 “이 사람이 이 작업을 해도 되는가?”를 확인하는 과정입니다.
예를 들어 서버가 세션을 검증해 예진 님임을 확인하는 것은 인증이고,
요청한 자료가 예진 님 소유인지 확인하는 것은 인가입니다.

이번 구현은 이 검사를 API마다 재사용할 수 있는 연결 기반입니다.
**실제 세션 저장소가 없으므로 기본 검증기는 모든 세션을 미인증으로 처리합니다.**
로그인·회원가입·세션 발급·JWT·OAuth·DB는 구현하지 않았습니다.
기존 헬스 경로는 공개 상태를 유지하고 운영용 보호 경로를 새로 만들지 않았습니다.

## 2. 파일별 역할

- [core/auth.py](../../apps/api/aura_api/core/auth.py): 확인된 사용자 자료 구조,
  세션 검증 인터페이스, 기본 거절 검증기, 인증 Dependency(디펜던시, 실행 전 공통 검사).
- [core/authorization.py](../../apps/api/aura_api/core/authorization.py): 필요한 모든 권한 검사와
  서버가 조회한 소유자 ID 비교.
- [config.py](../../apps/api/aura_api/config.py): 검증할 세션 쿠키 이름 설정과 형식 검사.
- [main.py](../../apps/api/aura_api/main.py): 기존 앱 팩토리에 쿠키 이름만 보관합니다.
  가짜 검증기나 인증 성공 상태는 등록하지 않습니다.
- [tests/test_auth.py](../../apps/api/tests/test_auth.py): 테스트 전용 보호 경로와 가짜 검증기를
  사용해 인증·인가·기존 보안과의 연결을 검사합니다.
- [환경 변수 예제](../../apps/api/.env.example): 쿠키 이름 설정 안내입니다.

기존 공통 오류 처리기, 요청 ID·CSRF 미들웨어, XSS 도구, BFF 코드는 변경하지 않았습니다.
새 의존성도 추가하지 않았습니다.

## 3. 세션 검증 인터페이스

`AuthenticatedUser`는 변경할 수 없는 데이터클래스(dataclass)입니다.
검증된 `user_id`와 `frozenset`(프로즌셋, 변경할 수 없는 집합) 형태의 권한 이름만 담습니다.
세션 쿠키·비밀번호·토큰 원문은 이 자료 구조에 넣지 않습니다.
기본 권한은 빈 집합이며 관리자·소유자에게 암묵적으로 권한을 부여하지 않습니다.

`SessionVerifier`는 Protocol(프로토콜, 구현체가 지켜야 할 인터페이스)입니다.

```python
async def verify_session(self, session_token: str) -> AuthenticatedUser | None:
    ...
```

실제 구현체는 전달된 불투명 세션 값을 서버 저장소에서 검증해야 합니다.
유효하고 만료·폐기되지 않은 세션과 사용자를 확인했을 때만 `AuthenticatedUser`를 반환합니다.
없는 세션·만료·폐기 등의 미인증 결과는 `None`입니다.
저장소 장애나 잘못된 구현 결과는 인증 성공으로 바꾸지 않고 기존 안전한 500 응답으로 처리합니다.

기본 `get_session_verifier()`는 항상 `RejectAllSessions`를 반환합니다.
쿠키 이름이나 값이 그럴듯해도 인증되지 않습니다.
실제 검증기를 나중에 공급할 연결 지점은 이 provider(프로바이더, 의존성 제공 함수)입니다.
가짜 검증기는 `test_auth.py`에만 정의하고 테스트 앱의 `dependency_overrides`에만 주입합니다.
다른 테스트 앱이나 `main.app`에는 등록하지 않습니다.

### 쿠키 이름 설정

FastAPI의 `AURA_SESSION_COOKIE_NAME` 기본값은 계약 예시와 같은 `aura_session`입니다.
실제 연계 시 Next 서버의 `API_SESSION_COOKIE`와 맞춰야 합니다.
설정은 앱 생성 시 읽으며 쿠키 이름을 요청 헤더나 쿼리로 바꾸지 않습니다.

Dependency는 이 이름의 쿠키 하나만 검증기에 전달합니다. 쿠키 누락·빈 값·같은 이름의
중복 쿠키는 401이며, 다른 쿠키와 인증 관련 임의 헤더는 인증 입력으로 사용하지 않습니다.
중복 검사는 여러 Cookie 헤더와 쿠키 이름 주변 공백도 고려합니다.
쿠키가 있다는 사실만으로 사용자를 확인했다고 판단하지 않습니다.

## 4. 인증·인가 재사용 방법

인증만 필요한 엔드포인트는 `user: CurrentUser`를 매개변수로 선언합니다.
`CurrentUser`는 `Depends(require_authenticated_user)`를 붙인 타입 별칭입니다.
인증에 실패하면 엔드포인트 본문을 실행하기 전에 401이 됩니다.

특정 권한이 필요한 엔드포인트에는 다음과 같이 선언할 수 있습니다.

```python
from typing import Annotated

from fastapi import Depends

from aura_api.core.auth import AuthenticatedUser
from aura_api.core.authorization import require_permissions

ExampleEditor = Annotated[
    AuthenticatedUser,
    Depends(require_permissions("example:read", "example:write")),
]
```

이 이름은 설명용이며 실제 도메인 권한을 확정한 것이 아닙니다.
`require_permissions()`는 먼저 인증하고 나서 요청한 권한을 **모두** 갖고 있는지 검사합니다.
권한 이름·사용자별 부여 방식·역할 변환은 실제 검증기와 도메인 구현에서 합의해야 합니다.

소유권은 도메인 코드가 자료를 서버에서 조회한 뒤
`ensure_resource_owner(user, resource.owner_user_id)`로 검사합니다.
`owner_user_id`에 클라이언트가 보낸 헤더·쿼리·본문 값을 넣으면 안 됩니다.
단순 소유자 비교는 자료 조회나 권한 검사를 대신하지 않습니다.
검증된 사용자는 서버의 신뢰 경계 안에서만 만들고, 클라이언트 입력 모델로 사용하지 않습니다.

## 5. 상태 코드와 기존 보안의 관계

- **401:** 세션이 없거나 검증 결과가 미인증입니다.
  `{"error":{"code":"HTTP_401","message":"인증이 필요합니다."}}`
- **403:** 인증됐어도 필요한 권한이 없거나 서버가 조회한 소유자가 다릅니다.
  `{"error":{"code":"HTTP_403","message":"요청 권한이 없습니다."}}`
- **409:** 기존 `X-Session-Owner`의 계정 전환 충돌 계약은 유지합니다.
  이번 인증 기반은 이 헤더를 사용자 신원으로 사용하거나 새로운 409 정책을 구현하지 않습니다.
- **500:** 세션 검증기 장애·잘못된 반환 자료형은 내부 연계 오류로 처리합니다.
  응답에 세션 비밀값이나 예외 원문을 넣지 않습니다.

```text
기본 서버 오류 계층
  → 요청 ID 설정
    → CSRF 출처 검사
      → 공통 예외 처리 계층
        → 라우터의 인증 Dependency: 세션 검증
          → 권한 검사 → 서버의 자료 조회·소유권 검사 → 업무 처리
```

CSRF 검사는 기존 순서를 유지합니다. 악성 출처의 변경 요청은 세션이 유효해도 먼저 403입니다.
따라서 모든 미인증 변경 요청이 반드시 401인 것은 아닙니다. CSRF를 통과한 뒤 인증이 없으면 401입니다.

BFF는 기존 불투명 세션 쿠키 전달과 `HttpOnly`·`SameSite=Lax`·HTTPS의 `Secure` 정책을 유지합니다.
`X-Aura-BFF-Key`는 출처 없는 서버 간 호출의 CSRF 검사에만 사용하며 사용자 인증이 아닙니다.
`X-User-ID`, `X-Session-Owner`, `X-Request-ID`, Authorization 헤더로 사용자를 만들지 않습니다.
정상·401·403·500 응답 모두 기존 요청 ID와 안전한 공통 오류 처리를 유지합니다.
Bearer 인증이나 새 WWW-Authenticate scheme(스킴)은 임의로 추가하지 않았습니다.

## 6. 검증

저장소 루트에서 실행합니다.

```sh
npm run check:api
git diff --check
git status -sb
```

2026-10-26 Python 3.14.6·기존 uv 환경에서 `npm run check:api`를 실행했습니다.
Ruff 린트·포맷 검사가 통과했고, **211개 통과, 0개 실패**입니다.
기존 API 회귀 171개와 새 인증·인가 테스트 40개를 포함합니다.
문서의 Prettier 검사와 상대 링크 확인, `git diff --check`도 통과했습니다.

추가로 실행한 `npm run build`는 통과했습니다. 전체 `npm run check`는 이번에 변경하지 않은
200개 파일의 기존 Prettier 포맷 경고에서 중단됐으며 해당 파일은 수정하지 않았습니다.
웹 소스와 공개 사용자 흐름을 변경하지 않아 이번에는 웹 테스트·E2E를 별도 재실행하지 않았습니다.

테스트는 기본 검증기의 전면 거절, 미인증·권한 부족·권한 보유, 본인·타인 자료,
헤더 사칭, 중복·다른 이름의 쿠키, 검증기 장애, CSRF 유지, 요청 ID,
오류 비밀값 비노출, 동시 요청의 사용자 분리와 기존 API 회귀를 확인합니다.
운영 앱에 테스트 경로나 가짜 검증기가 없고 OpenAPI 경로가 유지되는지도 검사합니다.
실제 세션 DB나 Next→FastAPI 운영 인증 성공을 검증한 것은 아닙니다.

## 7. 남은 구현과 협업 경계

- 전예진: 공통 인증 인터페이스·Dependency·권한/소유자 검사와 공통 오류·보안 연결을 담당합니다.
- 우섭님: 실제 자료 조회, 소유자 ID의 출처, 업무별 권한 이름·부여 규칙, 관리자 예외 여부,
  소유권 거절 시 존재를 숨기는 404 정책 여부를 합의해야 합니다. 이번에는 공통 403만 제공합니다.
- 다라님: 세션 저장소·DB 연결·마이그레이션·배포·TLS·비밀값 관리·접근 및 로그 정책을
  합의해야 합니다. 이번에 DB 구조나 인프라 설정을 변경하지 않았습니다.
- 실제 세션 담당자: 무작위 세션 발급, 저장 시 보호, 만료·폐기·회전·로그아웃,
  사용자 활성 상태·권한 조회와 검증기 provider 연결을 구현해야 합니다.
- BFF 담당자와 쿠키 이름·범위·삭제 응답, 401의 인증 challenge 필요 여부,
  계정 전환 409 및 실제 세션에 연결한 CSRF 토큰 필요성을 합의해야 합니다.
  이번에는 쿠키 발급·삭제·새 challenge·세션 토큰을 구현하지 않았습니다.
- 세션 저장소 장애의 세부 상태 코드, 권한 변경의 즉시 반영과 동시성·트랜잭션 정책은
  실제 저장소와 업무 구현 시 결정해야 합니다.
- 새 로깅은 추가하지 않았습니다. 검증기에서 비밀값이 포함된 예외를 발생시키면
  상위 서버 로그에는 남을 수 있으므로 실제 어댑터·인프라에서도 보호해야 합니다.

사용자는 권한 있는 API라도 매 요청 검증해야 하며, 이 기반을 사용하지 않는 새 경로가
자동으로 보호되는 것은 아닙니다. 실제 인증 전까지 로그인 성공 기능은 제공하지 않습니다.

참고: [BFF 계약](../FASTAPI_BFF.md), [CSRF·XSS 보안](SECURITY_CSRF_XSS.md),
[FastAPI Dependency](https://fastapi.tiangolo.com/tutorial/dependencies/),
[테스트 Dependency 교체](https://fastapi.tiangolo.com/advanced/testing-dependencies/).
