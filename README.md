# AURA — From Scent to Identity

Next.js 16.4.2 업그레이드와 AURA 팀 전달본의 인터랙션 개선을 반영했습니다. 조향 화면은 한 작업 화면과 혼합·시향 모달로 구성했습니다. 적용 내역과 검수 범위는 [QA 기록](docs/QA_RESULTS_KO.md), 화면별 동작은 [인터랙션 적용표](docs/REFERENCE_INTERACTION_MAPPING_KO.md)를 참고하세요.

향을 발견하고, 나만의 취향을 기록하는 프래그런스 커머스와 퍼스널 아틀리에.

Next.js App Router · React · TypeScript · Tailwind CSS. 최신 통합 PRD v1.0(2026-10-12)을 기준으로 전면 정리한 프론트엔드 소스입니다.

## 실행

Node.js 20.9 이상을 사용합니다. 프로젝트 폴더에서 실행하세요.

```powershell
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

## 모바일 흔들기 확인

iPhone Safari에서 HTTPS 주소로 `/atelier`에 접속한 뒤 향료 선택 → 섞기 → `휴대폰 흔들기 켜기` 버튼으로 센서 권한을 요청합니다. 로컬 개발에서는 `cloudflared tunnel --url http://localhost:3000`으로 HTTPS 주소를 만들 수 있습니다. 터널 도메인은 개발 설정에 허용되어 있습니다.

실제 기기의 센서와 권한 동작은 별도 확인이 필요합니다. 센서가 없거나 권한을 거절하면 자동 섞기 또는 수동 젓기를 이용할 수 있습니다.

## 구현 범위

- 홈 6개 섹션, 자연 스크롤, 컬렉션 원형 카드, 소식 캐러셀, 상품 캐러셀, Atelier 스크롤 장면
- FRESH / SOFT / WARM × 10개 상품, 30개 상세 화면
- 상품 검색, 컬렉션·유형 필터, 원화 가격 정렬
- 같은 컬렉션의 서로 다른 단품 3개를 고르는 Gift Set
- 장바구니 수량·구성·새로고침 유지, 주문 정보 화면
- 회원가입·로그인·로그아웃, 신규 회원 배송비 쿠폰 표시
- 향료 24개, 반복 투입, 최대 20회, 선택 비중·블렌딩 색·비커 높이 연동
- PC 원형 드래그, 모바일 흔들기 요청 및 버튼 대체 조작
- 디지털 시향, 이름·라벨 선택, 레시피 저장·다시 만들기·버전 관리
- 마이페이지의 저장한 향·쿠폰·주문·계정 영역
- 입점 문의 폼과 필수값 검증, 미연동 상태 안내
- 향료 투명 WebP 24장, 투명 벡터 59개, 제품 목업 WebP 27장, Pretendard 웹폰트

## 구조

| 경로 | 역할 |
|---|---|
| `app/` | App Router 화면, 전체 디자인 CSS, 문의 API |
| `components/editorial/Shared.tsx` | 공통 버튼 보조·타이포·제품 비주얼·비커·데이터 타입 |
| `components/editorial/Provider.tsx` | 장바구니·회원·레시피 공유 상태 |
| `components/editorial/Shell.tsx` | GNB·메가메뉴·검색·Footer |
| `components/editorial/Home.tsx` | 홈 섹션·스크롤 연출 |
| `components/editorial/Commerce.tsx` | 상품 카드·목록·상세·Gift Set·장바구니·주문 |
| `components/editorial/Atelier.tsx` | 조향 단계와 인터랙션 |
| `components/editorial/Account.tsx` | 회원 화면과 마이페이지 |
| `components/editorial/Partner.tsx` | 입점 문의 |
| `components/editorial/catalog.json` | 30개 상품과 3개 컬렉션 |
| `components/editorial/ingredients.json` | 향료 후보 24개 |
| `public/assets/products/` | 27개 단품 목업 |
| `public/assets/botanical/` | 1680×1680 투명 WebP 향료 24종 |
| `public/assets/editorial/` | 그룹별로 분리한 투명 SVG |
| `docs/` | 기준 PRD·에셋 목록·검수 기록·적용 제한 |

대표 경로: `/`, `/shop`, `/shop/[id]`, `/atelier`, `/login`, `/register`, `/cart`, `/checkout`, `/mypage`, `/partner`.

기존 `/products`, `/custom`, `/signup` 경로는 호환됩니다. 이전 `/cards`는 `/shop`으로 이동합니다. 카드·등급·포인트·Pickup 기능은 활성 소스에서 제외했습니다.

## 운영 연결 및 미확정 정보

현재 저장소와 프로젝트 발제의 프론트엔드 범위에 맞게 브라우저 저장소를 사용합니다. **상용 서버 인증·DB·PG·실제 주문 생성·문의 접수 서버는 연결되지 않았습니다.**

- 비밀번호는 salt + PBKDF2 검증값으로 저장하지만, 브라우저 저장소는 서버 인증을 대체하지 않습니다. HTTPS 또는 localhost가 필요합니다. 기기 간 동기화·이메일 복구·실주문 이력은 제공하지 않습니다.
- 향수 기존 가격을 FRESH 38,000원 / SOFT 42,000원 / WARM 46,000원으로 유지했습니다. 새 유형·Gift Set은 확인된 기존 가격이 없어 `price: null`과 `가격 확인 중`을 사용합니다. 임의 판매가를 추가하지 않았습니다.
- 쿠폰의 유효기간·최소 주문금액·복원 정책은 미확정입니다. 주문 화면의 쿠폰 적용은 금액 확인 UI이며 실제 사용 처리나 주문을 생성하지 않습니다.
- Custom의 제조 가능 범위와 가격이 미확정이므로 구매를 연결하지 않습니다. 조향 비중·액체 색은 개념적인 UX 표현입니다.
- 문의 API는 입력 검증 후 HTTP 503을 반환합니다. 실제 접수 없이 완료를 표시하지 않습니다.
- Gift Set 대표 비주얼은 복구한 같은 컬렉션 단품 사진 3장으로 만든 **실제 HTML/CSS 구성**입니다. 최종 선물 포장 목업은 미확정입니다.
- 목업의 인쇄된 향 노트·효능·전성분은 제조 검증 자료가 아닙니다. 컬렉션 노트·용량·재고 등 운영 데이터는 실제 판매 전 최종 대조가 필요합니다.
- SVG는 레퍼런스 기반으로 새로 그린 편집 가능한 벡터이며, 레퍼런스 사진을 SVG로 감싼 파일이 아닙니다. 원본과 픽셀 단위로 동일한 질감은 아닙니다.

향료 이미지는 기존 420px 원본을 1680px로 재출력한 WebP이며, 원본에 없던 세부 묘사가 복원된 것은 아닙니다. 이미지 목록과 해상도는 `public/assets/botanical-manifest.json`에서 관리합니다.

기획 원문은 [PRD.md](PRD.md)에, 최근 적용·검수 기록은 [docs/QA_RESULTS_KO.md](docs/QA_RESULTS_KO.md)에 있습니다. `docs`의 날짜가 붙은 이전 문서는 당시 구현·검수 이력입니다.
