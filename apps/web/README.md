# AURA 웹 앱

Next.js App Router·React·TypeScript로 스토어프런트와 BFF를 구현합니다. 앱 경로는 `apps/web`, npm workspace 이름은 `@aura/web`입니다. [모노레포 실행 안내](../../README.md)와 [문서 목록](../../docs/README.md)을 함께 참고하세요.

## 실행과 설정

아래 명령은 저장소 루트에서 실행합니다.

```sh
npm ci
npm run dev
```

`dev`는 Next.js(`http://localhost:3000`)와 Mock API(`http://127.0.0.1:4000`)를 함께 실행합니다. `npm run dev:web`과 `npm run mock:dev`로 따로 실행할 수도 있습니다.

설정이 필요하면 [환경 변수 예제](.env.example)를 `apps/web/.env.local`로 복사합니다. Next는 환경 파일을 `apps/web`에서 읽습니다. API 주소·접두사·세션 쿠키·제한시간은 [BFF 계약](../../docs/FASTAPI_BFF.md#실행-환경)에 정리되어 있으며, 설정 변경 후 웹 서버를 재시작합니다.

```sh
npm run build
npm run start:mock
```

`build`는 Mock API 없이도 실행할 수 있습니다. `next/font/google`이 글꼴을 내려받으므로 빌드 중 Google Fonts에 접근할 수 있어야 합니다. `start:mock`은 프로덕션 Next 서버와 Mock을 함께 실행합니다. 업무 API가 준비된 FastAPI를 연결한 환경에서는 `npm start`로 웹 서버만 실행합니다.

## 웹 앱 내부 구조

아래 경로는 `apps/web` 기준입니다.

라우팅과 화면 조합은 `app`, 업무별 구현은 `features`, 기능에 종속되지 않는 UI와 브라우저 훅은 `components`와 `hooks`에 둡니다. 파일은 kebab-case, React 컴포넌트는 PascalCase로 이름을 짓습니다.

```text
src/
  app/
    layout.tsx                 # 서버에서 공용 카탈로그 조회·캐시 hydration·사이트 조합
    providers.tsx              # QueryClient와 알림 인프라
    _components/               # 홈·헤더 등 여러 기능을 조합하는 화면 구현
    (auth)/                    # 로그인·가입 경로
    atelier/_components/       # 계정·장바구니·레시피·초안을 조향 편집기에 연결
    shop/, cart/, checkout/    # 얇은 서버 라우트 진입점
    mypage/, partner/
    admin/                     # 관리자 화면 진입점(운영 요약·상품·주문·문의)
    api/                       # 명시적인 BFF Route Handlers
    loading.tsx, error.tsx, global-error.tsx
  features/
    catalog/                   # 상품 조회·검색·필터·상품 표현
    account/                   # 세션·인증·회원 화면
    cart/                      # 장바구니·수량·가격 규칙
    atelier/                   # 조향·혼합·레시피·초안
    checkout/                  # 주문 조회·주문 정보 화면
    partner/                   # 문의 등록
    admin/                     # 관리자 DTO·조회·수정·화면(소비자 DTO와 분리)
    onboarding/                # 가입 후 안내
  components/
    ui/, brand/, illustrations/, layout/, feedback/
  hooks/                       # 화면 폭·공유 API·기기 센서 등 브라우저 기능
  server/
    bff/                       # 출처·본문·세션 쿠키·브라우저 응답 경계
    backend/                   # FastAPI/Mock 설정·서버 전용 HTTP 연결
  lib/api/                     # 브라우저 클라이언트·공용 오류·RSC 조회 연결
  lib/                         # 형식·입력 검증·내부 경로·테스트 식별자
  styles/                      # 토큰·기본값·공유 요소·사이트 셸·모션·공유 커머스 모듈
mock-server/
  app.ts, index.ts             # 독립 Express HTTP 서버
  routes/                     # 인증·조향·주문·문의·관리자 API
  fixtures/catalog.json       # 상품·컬렉션·향료·프로모션·추천 이름 원본
  data/store.ts               # Mock 저장소
  .data/db.json               # 실행 중 생성되는 로컬 데이터, Git 제외
tests/
  unit/                       # 순수 도메인·리다이렉트 검증
  integration/                # 실제 HTTP·소유권·파일 저장 검증
e2e/
  fixtures/                   # API 시드·시나리오 데이터·공통 테스트 설정
  pages/                      # 화면 선택자와 사용자 조작
  support/                    # 브라우저 센서 모의 구현
  snapshots/                  # 로컬 이미지 기준, Git 제외
```

각 기능의 `model`은 타입·순수 규칙·reducer, `api`는 HTTP 요청과 쿼리 계약, `hooks`는 서버 구독 또는 상태 생명주기, `components`는 표현과 사용자 입력을 맡습니다. 공통 라이브러리로 옮기는 기준은 실제 재사용입니다. 기능마다 빈 계층이나 통합 barrel 파일을 만들지 않습니다.

`page.tsx`·`layout.tsx`는 서버 컴포넌트로 유지하고, 상태·이벤트·브라우저 API가 필요한 하위 구현에 클라이언트 경계를 둡니다. 홈과 상품 상세는 서버에서 API를 조회합니다. 공용 카탈로그만 요청별 QueryClient에 담아 클라이언트에 전달하고, 세션·회원 데이터는 브라우저의 동일 출처 API에서 조회합니다. 사용자 간 서버 캐시를 공유하지 않습니다. `/products`, `/custom`, `/signup`, `/cards`의 기존 URL도 유지합니다.

의존 방향은 `app → features → components/hooks/lib`입니다. 기능은 다른 기능의 모델·API·훅을 필요한 범위에서 조합할 수 있으며, 기능 간 화면 조합은 `app`에서 담당합니다. 공용 UI·브라우저 훅은 기능이나 라우트를 가져올 수 없습니다. 순수 모델은 React·브라우저·전송 계층에 의존하지 않습니다. 프런트엔드의 Mock fixture 직접 참조, 역방향 의존, 라우트 진입점의 클라이언트 전환은 ESLint로 검사합니다.

## BFF와 FastAPI 연결

브라우저는 동일 출처 `/api`만 호출합니다. Next의 명시적인 Route Handler가 허용한 리소스를 FastAPI 또는 Mock으로 연결합니다. 외부 rewrite와 catch-all 프록시는 제거했습니다. Server Components는 BFF를 HTTP로 재호출하지 않고 같은 서버 전용 통신 모듈로 데이터 원본을 직접 조회합니다.

BFF는 요청 출처·JSON 크기·허용 쿠키·제한시간을 처리하고, FastAPI의 `detail` 및 422 오류를 공통 오류 형식으로 변환합니다. 가격·소유권·인증·트랜잭션은 백엔드에서 검증합니다. FastAPI 앱의 헬스 체크·설정·테스트 골격은 `apps/api`에 준비했으며, 업무 API는 현재 Mock으로 동작을 검증합니다.

설정 예제, 리소스별 입력·응답 DTO, 세션·오류 계약, OpenAPI 인계 기준은 [FastAPI BFF 연결 문서](../../docs/FASTAPI_BFF.md)에 정리했습니다.

## 데이터 소유권과 Mock API

장바구니는 브라우저 `localStorage`의 `aura_cart_v1` 키에 상품 ID·수량·선택 구성을 저장합니다. 로그인·로그아웃과 관계없이 같은 브라우저에서 유지하며, 같은 출처의 다른 탭에도 변경을 반영합니다. 컬렉션·향료·프로모션·추천 이름은 서버 fixture에서, 상품(fixture로 초기화한 뒤 관리자 수정 반영)·회원·세션·레시피·초안·주문·문의·관리자 이력은 Mock 저장소에서 관리하고 HTTP로 접근합니다. `sessionStorage`에는 가입 안내 표시 여부만 남아 있습니다.

| API                                                 | 책임                          |
| --------------------------------------------------- | ----------------------------- |
| `GET /api/catalog`, `GET /api/catalog/products/:id` | 공용 상품·향료·홈 데이터      |
| `GET /api/session`                                  | 현재 회원과 익명 방문자 식별  |
| `POST /api/auth/register`, `/login`, `/logout`      | 회원·세션 변경                |
| `GET/POST /api/recipes`, `DELETE /api/recipes/:id`  | 회원별 레시피와 버전          |
| `GET/PUT/DELETE /api/atelier/draft`                 | 방문자별 조향 초안            |
| `GET/POST /api/orders`                              | 회원 주문 조회·모의 주문 생성 |
| `POST /api/partner`                                 | 모의 입점 문의 저장           |
| `/api/admin/**`                                     | 관리자 전용 운영 API          |

Mock 서버는 HttpOnly·SameSite 쿠키로 세션을 식별하고 비밀번호는 서버에서 scrypt 검증값으로 저장합니다. 레시피와 주문은 회원별로 분리합니다. 로컬 장바구니는 인증 변경 시에도 그대로 유지합니다. 조향 초안은 가입·로그인 이동 중에도 이어지도록 방문자에 귀속합니다. 가격·유효한 구성·레시피 ID·버전·생성 시각은 서버에서 결정합니다. 클라이언트가 보낸 가격을 주문 계산에 사용하지 않습니다.

본문이 필요한 API는 JSON 객체만 받으며, 본문 누락·잘못된 JSON·배열은 400, 비 JSON 본문은 415, 32KiB 초과는 413으로 응답합니다. 파서 오류에 입력값을 포함하지 않습니다. 로그아웃과 삭제는 본문 없이 호출할 수 있습니다.

장바구니는 `useSyncExternalStore`로 구독하며 초기 복원이 끝나기 전에 빈 배열을 저장하지 않습니다. 손상된 JSON은 빈 장바구니로 복원하고, 저장 공간이 차단되면 저장 실패를 알리며 담기 성공을 표시하지 않습니다. 로컬 상품·가격·`unitPrice`는 신뢰하지 않고 현재 카탈로그로 복원합니다. 같은 항목의 누적 수량 15개 상한과 단품·Gift Set 구성품의 합산 재고를 화면에서 검사합니다.

장바구니 API는 제거했습니다. 모의 주문은 `{ recipient, address, coupon?, items }`를 받으며, 각 `items` 항목에 `{ productId?, quantity, selection?, custom? }`를 전송합니다. 서버가 가격·구성·수량·재고와 맞춤 색을 다시 계산하고 응답의 상품에 `unitPrice`를 포함합니다. 사용자 간 재고 예약이나 주문 후 fixture 재고 차감은 수행하지 않습니다. 실제 주문 UI를 연결할 때는 주문 성공을 확인한 뒤 로컬 장바구니를 비웁니다.

TanStack Query는 서버 데이터의 조회·로딩·오류·변경 후 캐시 갱신을 맡습니다. 회원별 쿼리 키에 소유자를 포함하고 인증 변경 시 기존 개인 캐시를 취소·제거합니다. 레시피 변경 요청에는 시작 시점의 소유자를 보내 계정 전환 중 잘못된 소유자에게 적용되는 요청을 거절합니다. 초기 조회가 끝나기 전에 빈 초안으로 편집기를 초기화하지 않습니다.

기본 저장 파일은 `apps/web/mock-server/.data/db.json`이며 서버를 재시작해도 유지합니다. 삭제하면 초기화됩니다. `MOCK_PERSIST=0 npm run mock`은 메모리에서만 동작합니다. `MOCK_PORT`로 포트를 지정할 수 있습니다. 이 저장소는 단일 프로세스 개발용 JSON 파일이며 운영 DB의 트랜잭션·배포·복구를 제공하지 않습니다. 기존 서버 장바구니는 브라우저로 자동 이전하지 않으며 저장 파일에서 다시 불러오지 않습니다.

관리자 계약은 [BFF 문서의 관리자 API](../../docs/FASTAPI_BFF.md#관리자-api-1단계-제안)를 따릅니다. `npm run mock`은 시작할 때 개발용 관리자 계정 `admin@aura.local` / `aura-admin-local`을 생성하거나 관리자 역할로 되돌립니다. `MOCK_ADMIN_EMAIL`·`MOCK_ADMIN_PASSWORD`로 바꾸고, `MOCK_ADMIN_EMAIL=`(빈 값)이면 생성하지 않습니다. 이 계정은 로컬 Mock 전용이며 운영 관리자 발급 절차와 무관합니다. 로그인 후 `/admin` 또는 마이페이지의 관리자 링크로 이동합니다.

Playwright는 `MOCK_TEST_MODE=1`, `MOCK_PERSIST=0`으로 API를 시작하고 테스트별 쿠키에 연결된 `POST /__test__/seed`로 데이터를 준비합니다. 일반 실행에서는 시드 경로를 노출하지 않습니다. 다른 테스트나 실제 개발 데이터를 전역 초기화하지 않습니다.

## 훅의 책임

조향 규칙은 `atelier/model/composition.ts`의 순수 reducer에서 처리합니다. `useComposition`은 편집 상태와 의미 있는 명령만 공개하며 URL·API·저장소·센서에 관여하지 않습니다. `useDraft`는 서버 초안을 구독하고, `useDraftAutosave`는 변경을 지연 저장하며 이동 시 남은 변경을 반영합니다. 초안 저장과 삭제는 같은 큐에서 실행해 늦은 저장이 삭제한 초안을 복원하지 않게 합니다.

`useBlend`는 혼합 모드를 조합하고 포인터·키보드 입력은 `useStirGesture`, 자동 진행과 타이머는 `useAutomaticBlending`, 흔들기 감지는 `useShakeBlending`에 둡니다. 공용 `useDeviceMotion`은 권한·이벤트 구독·정리만 맡습니다. 모달을 닫은 뒤 도착한 권한 응답으로 센서를 다시 구독하지 않습니다. 표현 컴포넌트에는 필요한 상태와 콜백을 명시적으로 전달합니다.

`useProductFilters`는 URL의 필터·검색 조건과 입력 중인 검색어를 구분합니다. 파생 목록은 별도 effect 상태로 복제하지 않습니다. SSR이 필요한 브라우저 기능 감지는 `useSyncExternalStore`로 서버 스냅샷과 브라우저 구독을 구분합니다.

구조와 훅의 기준은 설치된 Next.js 문서, [React의 커스텀 훅](https://react.dev/learn/reusing-logic-with-custom-hooks), [불필요한 Effect 제거](https://react.dev/learn/you-might-not-need-an-effect), [TanStack Query의 서버 렌더링](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)을 참고합니다.

## 검증

```sh
npm run check:web
npm run build
npm exec --workspace @aura/web -- playwright install chromium
npm run test:e2e
```

`check:web`은 ESLint·CSS 구조 검사·Next 라우트 타입 생성·TypeScript·Vitest를 실행합니다. 저장소 포맷과 Python까지 검증하려면 루트에서 `npm run check`를 사용합니다. 단위 테스트는 조향·수량·복원·내부 리다이렉트 규칙을, 통합 테스트는 실제 HTTP 요청으로 회원 간 데이터 분리·가격 변조 거절·레시피 버전·초안·모의 주문·문의·파일 영속성을 검증합니다.

Playwright는 포트 4000의 메모리 Mock API와 포트 3100의 프로덕션 Next BFF 서버를 자동 시작·종료합니다. 기본 검증은 데스크톱·모바일 조작, 로그인·로그아웃 후 로컬 장바구니 유지, 새로고침·탭 간 동기화·저장 실패, 검색 URL 동기화, 조향 초안 복원·초기화, 혼합·센서 권한 정리를 포함합니다. 실제 iPhone Safari의 센서·권한 동작은 기기 검증이 필요합니다.

개발 서버를 켜 둔 채 검증하려면 `AURA_E2E_MOCK_PORT=4100 npm run test:e2e`로 테스트 Mock 포트를 분리합니다. 반응형 회귀 검증에는 320px 가로 넘침, 상품 사진과 제목의 겹침, Gift Set 선택·축소 이미지, 조향 결과 버튼 배치, 컬렉션 설명 정렬도 포함합니다.

테스트 선택자는 화면 문구·CSS 클래스와 분리합니다. 역할은 `getByRole`, 특정 조작은 `src/lib/test-ids.ts`의 식별자를 사용합니다. 선택자와 반복 조작은 `e2e/pages`, 데이터와 API 시드는 `e2e/fixtures`, 명세는 사용자 시나리오와 독립적인 기대 결과를 담당합니다. [Playwright Best Practices](https://playwright.dev/docs/best-practices)와 [Page Object Models](https://playwright.dev/docs/pom)를 기준으로 합니다.

스크린샷 기준 `e2e/snapshots/`는 Git에서 제외합니다. 기본 E2E는 이미지 비교를 제외하므로 새 체크아웃에서도 실행됩니다. 로컬 기준 파일이 있으면 다음 명령으로 데스크톱·태블릿·모바일 화면을 비교합니다.

```sh
npm run test:e2e:visual
```

의도한 디자인 변경을 확인한 경우에만 `npm run test:e2e:visual -- --update-snapshots`로 기준을 갱신합니다. 실패 결과와 추적은 `test-results/`에 남습니다.

## CSS 유지보수

전역 진입점은 `src/app/globals.css` 하나입니다. `src/styles`는 토큰·문서 기본값·공유 요소·사이트 셸·모션을 담당하고, 기능별 스타일은 해당 컴포넌트 옆 CSS Module에 둡니다. 목록·상세·장바구니·주문이 함께 쓰는 기존 커머스 모듈은 `src/styles/commerce.module.css`에 두어 다른 기능의 컴포넌트 디렉터리에 의존하지 않게 합니다.

조향 스타일은 컴포넌트 책임에 맞춰 CSS Module로 나눕니다. 클래스는 `card`, `meter`, `nameField`처럼 역할을 나타내고, 버전 접두사와 중복 별칭을 추가하지 않습니다. 선택·진행 상태는 ARIA 속성, 라벨 종류는 `data-label`, 컴포넌트 간 표현 연결은 `data-atelier-part`로 나타냅니다.

CSS 검사는 PostCSS와 TypeScript 파서로 전역 진입점·클래스 참조·문서 스타일 유출을 검사합니다. 조향 모듈에는 800줄 상한·의미 있는 로컬 이름·미사용 및 누락 클래스·빌더 미지원 문법 검사를 적용합니다. 홈·커머스·회원·입점의 일부 기존 전역 이름과 `!important`는 후속 정리 대상입니다. 디자인 변경이 없는 정리는 기존 화면 비교를 통과해야 합니다.

## 구현 범위와 운영 연결

30개 상품의 목록·상세·검색·Gift Set 구성, 장바구니, 가입·로그인, 24개 향료의 조향·혼합·레시피·초안, 회원 화면과 문의 폼을 제공합니다. 기존 화면 검수 기록은 [QA 기록](../../docs/archive/QA_RESULTS_KO.md)과 [인터랙션 적용표](../../docs/archive/REFERENCE_INTERACTION_MAPPING_KO.md)에 남겨 두었습니다. 현재 데이터 구조와 웹 개발 방법은 이 문서를 기준으로 합니다.

현재 인증·주문·문의는 개발용 Mock API입니다. 실서비스 인증·DB·PG·이메일은 연결하지 않았습니다. 결제 버튼은 비활성 상태이며 주문 API는 모의 주문만 생성합니다. 문의 완료 화면도 실제 발송과 구분해 모의 저장임을 안내합니다. 판매 가격·재고·쿠폰 정책·맞춤 조향 제조 범위는 운영 연결 시 확정해야 합니다.

Gift Set 비주얼은 단품 사진 세 장을 조합한 HTML/CSS이며 최종 포장 목업은 미확정입니다. 조향 색과 비중은 개념적인 표현이고, 목업에 인쇄된 향 노트·효능·전성분은 제조 검증 자료가 아닙니다. 향료 이미지 목록과 해상도는 `public/assets/botanical-manifest.json`에서 관리합니다.
