# AURA CSRF·XSS 공통 보안

## 1. 목적과 공격의 차이

CSRF(씨에스알에프, 사이트 간 요청 위조)는 악성 사이트가 방문자의 쿠키를 이용해
원하지 않는 변경 요청을 보내게 하는 공격입니다. 예를 들어 다른 사이트의 폼이 AURA의
조향 초안을 덮어쓰는 요청을 보낼 수 있습니다.

XSS(엑스에스에스, 사이트 간 스크립팅)는 사용자 입력을 실행 가능한 HTML·스크립트로
출력해 공격 코드가 AURA 화면에서 실행되게 하는 공격입니다. 예를 들어 레시피 이름의
`<script>` 문자열을 HTML로 직접 삽입하면 문제가 됩니다.

이번 구현은 CSRF 출처 검사와 출력에 사용할 공통 도구를 제공합니다.
**XSS는 백엔드 미들웨어 하나로 완전히 차단할 수 없습니다.**
인증(누구인지 확인)·인가(무엇을 할 수 있는지 확인)도 별도로 필요합니다.

## 2. 기존 구조 확인

- [BFF handler](../../apps/web/src/server/bff/handler.ts)는 변경 요청의 다른 `Origin`과
  `Sec-Fetch-Site: cross-site`를 거절합니다. BFF의 출처 없는 호출 허용 정책은 유지합니다.
- [request-origin.ts](../../apps/web/src/server/bff/request-origin.ts)는 `APP_ORIGIN`을 우선합니다.
  개발 모드에만 로컬 주소·포트가 일치하는 Host 예외가 있습니다. 운영에서는 정식
  `APP_ORIGIN`을 설정해야 합니다. 이번 FastAPI 검사는 Host·Forwarded 헤더를 사용하지 않습니다.
- [session-cookie.ts](../../apps/web/src/server/bff/session-cookie.ts)는 지정된 세션 쿠키만
  전달하고 `HttpOnly`, `SameSite=Lax`, HTTPS에서 `Secure`를 적용합니다.
- BFF는 `nosniff`, `private, no-store`, 세션 응답의 `Vary: Cookie`를 이미 적용합니다.
- BFF가 FastAPI로 브라우저의 Origin·Referer·Fetch Metadata를 전달하지 않는 구조는 유지합니다.
- CRA-8의 요청 ID·공통 예외 처리기는 유지하고 500 응답의 보안 헤더만 보완합니다.
- `apps/web/src` 검색에서 `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, `eval`, `new Function` 또는 동적 스크립트 삽입을
  발견하지 못했습니다. React(리액트) JSX의 일반 문자열 출력 방식을 유지합니다.
- 기존 `next.config.ts`에 CSP(씨에스피, 콘텐츠 보안 정책)·전역 보안 헤더 설정은 없습니다.
  상품 이미지에는 데이터 기반 URL이 있어 향후 운영 데이터 도입 시 URL 정책 연결이 필요합니다.
- FastAPI의 업무 경로는 현재 헬스 GET뿐이며 상태 변경은 없습니다. HEAD·OPTIONS는 별도
  업무 처리를 하지 않습니다. BFF의 조회 경로도 상태 변경용 업무를 호출하지 않습니다.
  Mock의 세션 조회는 익명 방문자 쿠키를 발급할 수 있으므로 쿠키 발급과 업무 변경은 구분합니다.

## 3. 구현 파일

- [core/csrf.py](../../apps/api/aura_api/core/csrf.py): 변경 요청의 출처와 서버 호출 키 검사,
  공통 403 반환 및 응답 보안 헤더 적용.
- [core/security.py](../../apps/api/aura_api/core/security.py): 출처 URL 해석,
  HTML 텍스트 이스케이프, 공개 링크 URL 검증, 응답 보안 헤더.
- [config.py](../../apps/api/aura_api/config.py): 허용 출처와 서버 전용 키 설정 검증.
- [main.py](../../apps/api/aura_api/main.py): 기존 앱 팩토리에 CSRF 미들웨어 연결.
- [exception_handlers.py](../../apps/api/aura_api/core/exception_handlers.py): 바깥 계층에서
  생성하는 500에도 보안 헤더 적용.
- [test_security.py](../../apps/api/tests/test_security.py): 공격·정상 요청과 출력 도구 테스트.
- [test_core.py](../../apps/api/tests/test_core.py): 기존 변경 요청 테스트에 명시적인 허용 출처 설정.
- BFF의 [config.ts](../../apps/web/src/server/backend/config.ts)와
  [transport.ts](../../apps/web/src/server/backend/transport.ts): 서버 설정에 키가 있을 때만
  백엔드 변경 요청에 넣습니다. 브라우저가 보낸 키를 복사하지 않습니다.
- [bff.test.ts](../../apps/web/tests/integration/bff.test.ts): 키 전달·미설정·잘못된 설정 검사.
- 각 앱의 `.env.example`: 실제 비밀값 없는 설정 안내.

새 패키지, 로그인·JWT·세션·DB·도메인·장바구니 기능은 추가하지 않았습니다.

## 4. 요청 처리 순서

```text
ServerErrorMiddleware
  → RequestIDMiddleware: 요청 ID 설정
    → CSRFMiddleware: 출처 검사 및 응답 보안 헤더
      → ExceptionMiddleware: HTTP 예외·요청 검증 오류
        → 라우터 → 엔드포인트
```

미들웨어는 요청 앞뒤의 공통 처리이고, 예외 처리기는 발생한 오류를 응답으로 바꾸는 함수입니다.
미들웨어에서 차단할 때는 HTTPException을 발생시키지 않고 기존 공통 오류 본문으로
403을 직접 반환합니다. 바깥의 요청 ID 미들웨어가 차단 응답에도 ID를 붙입니다.
예상하지 못한 500은 기존 안전한 ID 대체 정책과 보안 헤더 함수를 함께 사용합니다.

## 5. CSRF 허용·차단 정책

- `GET`, `HEAD`, `OPTIONS`는 CSRF 검사에서 제외합니다. 해당 메서드에 업무 변경을
  구현하면 안 됩니다. 경로 존재 여부와 허용 메서드에 따른 404·405는 유지됩니다.
- 그 외 메서드는 출처를 검사합니다. 출처가 없는 변경 요청은 기본 403입니다.
  라우팅 전 검사이므로 출처 없는 POST는 없는 경로에서도 먼저 403을 받을 수 있습니다.
- `Sec-Fetch-Site`가 `cross-site`이거나 알려지지 않은 값이면 거절합니다.
  `same-origin`, `same-site`, `none` 값만으로 요청을 허용하지 않습니다.
- Origin이 있으면 허용 목록과 비교합니다. 없으면 Referer(리퍼러)의 출처를 사용합니다.
  둘 다 있으면 출처도 서로 일치해야 합니다.
- `Origin: null`, 빈 값, 쉼표로 합쳐진 출처, 공백·제어문자·역슬래시·사용자 정보,
  잘못된 포트와 중복된 출처/Fetch Metadata/서버 키 헤더는 거절합니다.
- Origin에는 경로·쿼리·fragment를 허용하지 않습니다. Referer에는 경로·쿼리를 허용합니다.
  호스트 대소문자와 기본 포트는 정규화하고, 와일드카드·접미사 일치는 사용하지 않습니다.
- 요청의 Host, X-Forwarded-Host, X-Forwarded-Proto로 허용 목록을 만들지 않습니다.
- 차단 본문은 `{"error":{"code":"HTTP_403","message":"요청 권한이 없습니다."}}`입니다.
  요청 본문이나 비밀키를 오류에 넣거나 로그로 남기지 않습니다.

### BFF의 출처 없는 서버 간 호출

출처가 없는 BFF 요청을 구별하기 위해 **선택적으로 설정하는 서버 전용 공유 키**를 사용합니다.
이는 사용자 인증이나 세션용 CSRF 토큰이 아닙니다. 별도의 쿠키·사용자 저장소를 만들지 않습니다.

```dotenv
# FastAPI: 직접 브라우저 요청에 허용할 출처를 JSON 배열로 설정
AURA_CSRF_ALLOWED_ORIGINS=["https://mall.example.com"]
# FastAPI와 Next 서버에 동일한 무작위 비밀값을 안전하게 주입
# AURA_BFF_SHARED_KEY=<32~128자의 무작위 URL-safe 값>
# API_BFF_SHARED_KEY=<위와 동일한 값>
```

허용 출처 기본값은 빈 목록, 공유 키 기본값은 미설정입니다. 설정이 없으면 헬스 조회는
가능하지만 출처 없는 변경 요청은 거절됩니다. FastAPI 업무 API 연결 전 두 서버의 키를
설정해야 하며 Mock을 사용하는 기존 기본 개발은 키 없이 그대로 작동합니다.

BFF는 서버 환경의 `API_BFF_SHARED_KEY`만 `X-Aura-BFF-Key`로 전송합니다.
GET·HEAD·OPTIONS에는 보내지 않습니다. API는 출처·Referer·Fetch Metadata가 없는 경우에만
정확히 일치하는 키로 변경 요청을 허용합니다. 악성 출처나 cross-site 표시는 키로 우회하지 못합니다.
비교에는 일정 시간 비교 함수를 사용합니다. 키는 32~128자의 URL-safe ASCII로 제한합니다.
잘못된 설정의 오류 메시지에도 입력값을 표시하지 않도록 설정했습니다.

브라우저 번들·응답·로그·Git에 키를 넣지 말아야 합니다. 운영에서는 TLS와 내부 접근 제한이
필요합니다. 키 유출·재사용을 이 모듈이 막지는 못하므로 주입·회전·접근 권한은 배포 담당자와
합의해야 합니다. 기존 Origin·SameSite 방어를 대신하는 값이 아닙니다.

## 6. XSS 출력 보호

JSON의 HTML 문자열은 삭제·치환하지 않습니다. 저장값을 훼손하거나 이중 인코딩하지 않고,
출력 위치에서 맞는 도구를 사용해야 합니다.

- 일반 React 문자열 출력은 기존 이스케이프를 유지합니다.
- `escape_html_text()`는 HTML 텍스트와 따옴표로 감싼 일반 속성 값의 특수문자를
  이스케이프(문자 그대로 표시)합니다. JavaScript·CSS·이벤트 속성·URL에 사용하면 안 됩니다.
- `validate_public_url()`은 HTTP(S) 절대 주소와 `/` 하나로 시작하는 상대 경로만 허용합니다.
  `/상품`, `https://example.com/상품` 같은 한국어 경로와 `#section`, `#상세` 같은
  fragment(프래그먼트, 문서 내 위치)를 허용합니다. 경로·쿼리·fragment의 일반 유니코드와
  UTF-8 퍼센트 인코딩을 지원하고, 검증 후 입력 문자열을 그대로 반환합니다.
  `javascript:`, `data:`, `vbscript:`, 프로토콜 생략 `//`, 제어문자·역슬래시·인증정보 URL은 거절합니다.
  공백과 숨은 형식 제어문자도 거절합니다. 원문과 반복 디코딩 결과를 모두 검사하므로
  `/%2fevil.test`, `/%252fevil.test`, 인코딩된 역슬래시·제어문자로 우회할 수 없습니다.
  최대 8회의 검사 안에 디코딩이 끝나지 않거나 UTF-8 인코딩이 잘못된 값은 거절합니다.
  호스트는 기존 ASCII 검증을 유지하며, CSRF 출처 파싱 정책은 변경하지 않습니다.
  외부 서버를 직접 fetch할 때 쓰는 SSRF 방어 도구는 아닙니다.
- 이 도구들은 실제 업무의 입력 모델·출력 지점에서 명시적으로 사용해야 합니다.
  현재 업무 API나 화면 URL에 전역 연결하지 않았습니다. 기존 화면 데이터는 변경하지 않습니다.
- 서식 있는 HTML이 필요한 운영 경로는 발견되지 않아 Sanitization(새니타이제이션,
  허용된 HTML만 남기는 처리) 패키지는 추가하지 않았습니다. 향후 해당 경로에 검증된 도구를
  적용하고 HTML·속성·스크립트·URL별 정책을 따로 검토해야 합니다.

API 응답에 `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
`Cache-Control: private, no-store`를 적용합니다. 기존 Vary 값에 Origin·Referer·Sec-Fetch-Site를
합칩니다. 기존 `Vary: *`는 유지합니다.

JSON 응답에만 `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` CSP를 적용합니다.
FastAPI Swagger UI와 Next HTML에는 이 CSP를 적용하지 않습니다. Next의 스크립트·스타일·폰트와
호환되는 nonce 기반 CSP는 프런트엔드 담당자가 별도 검증해야 합니다.
FastAPI 헤더는 BFF가 모두 전달하지 않으므로 웹 HTML 보호가 자동으로 완성되지는 않습니다.

## 7. 검증

루트에서 다음 명령으로 확인합니다.

```sh
npm run check:api
npm test --workspace @aura/web -- tests/integration/bff.test.ts
npm run test:e2e --workspace @aura/web -- e2e/bff.spec.ts
git diff --check
git status -sb
```

2026-10-26 Python 3.14.6·기존 uv 환경에서 API 린트·포맷 검사가 통과했고,
**142개 통과, 0개 실패**를 확인했습니다. 기존 57개와 새 보안 85개입니다.
API 테스트의 경로는 테스트 앱에만 등록합니다.

URL 허용 정책 보완 후 같은 환경에서 `npm run check:api`를 재실행해 린트·포맷 검사와
**171개 통과, 0개 실패**를 확인했습니다. 정상 한국어 경로·fragment와 인코딩 우회 거부 등
URL 테스트 29개를 추가했습니다. CSRF 미들웨어·BFF 공유 키·보안 헤더는 변경하지 않았습니다.

안전한 조회, 허용 출처의 네 가지 변경 메서드, Referer 대체, BFF 형태의 쿠키·키 요청,
악성 출처·헤더 충돌·중복·Host 위조·누락 출처, 차단 403·요청 ID,
JSON 원문 보존·HTML 이스케이프·위험 URL 거부·500 보안 헤더와 Swagger 유지 등을 검사합니다.

- `npm run check:web`: 웹 린트·CSS·타입 검사 통과, 7개 테스트 파일의 **81개 통과, 0개 실패**.
- BFF HTTP 통합 테스트 단독 실행: **15개 통과, 0개 실패**. 위 웹 81개에 포함된 검사입니다.
- BFF E2E: 실제 Next·Mock 서버에서 desktop/mobile **8개 통과, 0개 실패**.
  최초 실행은 Chromium 런타임 누락으로 8개가 시작에 실패했고, 테스트 런타임 설치 후 재검증했습니다.
- `npm run build`: Next.js 16.4.2 프로덕션 빌드 통과.
- `npm run check`: 이번에 수정하지 않은 194개 파일의 기존 Prettier 포맷 경고에서 중단.
  해당 파일들은 변경하지 않았고 API·웹 검사는 개별 명령으로 통과를 확인했습니다.
- 변경한 TypeScript·Markdown 파일의 Prettier 검사는 별도로 통과했습니다.

E2E는 Mock 백엔드를 사용합니다. 실제 Next와 FastAPI 간 공유 키 전달을 한 프로세스 흐름으로
검증한 것은 아닙니다. BFF의 실제 HTTP 전송 테스트와 FastAPI의 BFF 형태 요청 테스트를
각각 실행했으며, 업무 API 연결 시 두 서버를 함께 실행한 검증이 추가로 필요합니다.

## 8. 남은 위험과 협의 사항

- 세션 인증이 구현되면 세션 수명·쿠키·로그아웃과 결합한 CSRF 토큰 필요성을 재평가해야 합니다.
  현재는 세션에 묶인 토큰을 발급하거나 검증하지 않습니다.
- 허용 출처에서 발생한 XSS, 브라우저 확장 프로그램, 탈취된 서버 키, 악성 내부 호출자,
  사용자별 권한·소유권 문제를 이 출처 검사로 해결할 수 없습니다.
- BFF의 기존 출처 없는 호출 허용은 변경하지 않았습니다. 공개 BFF의 엄격한 누락 출처·중복
  Fetch Metadata 정책은 팀장과 별도 합의가 필요합니다. 백엔드 키가 BFF의 검사를 강화하지는 않습니다.
- 팀장: 직접 API 호출 허용 범위, 업무 출력 지점의 URL 정책 적용, 서식 HTML 도입 여부,
  Next CSP와 실제 브라우저 검증, 상태 변경 없는 GET 원칙을 확인해야 합니다.
- 인증 담당자: 세션 쿠키와 CSRF 토큰·헤더 전달, SameSite 정책, 인증·인가 경계를 합의해야 합니다.
- 인프라 담당자: 허용 출처, TLS·API 외부 노출, 비밀키 생성·주입·회전·로그 마스킹,
  본문·빈도 제한을 합의해야 합니다. 이번 작업은 배포나 인프라 설정을 변경하지 않습니다.

참고: [OWASP CSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP XSS 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html),
[BFF 계약](../FASTAPI_BFF.md), [CRA-8 공통 모듈](COMMON_MODULES.md).
