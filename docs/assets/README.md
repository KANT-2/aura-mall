# 에셋과 글꼴

현재 웹 자산의 원본 위치는 [`apps/web/public/assets`](../../apps/web/public/assets)입니다. 브라우저에서는 `/assets/...` 경로로 접근합니다. 아래 경로는 저장소 루트 기준입니다.

| 위치                                                                         | 용도                                   |
| ---------------------------------------------------------------------------- | -------------------------------------- |
| [`apps/web/public/assets/botanical`](../../apps/web/public/assets/botanical) | 조향 향료 24종의 투명 WebP             |
| [향료 manifest](../../apps/web/public/assets/botanical-manifest.json)        | 향료 파일·사용처·제작 출처·해상도 기록 |
| [`apps/web/public/assets/editorial`](../../apps/web/public/assets/editorial) | 비커·도구·보틀·장식 SVG                |
| [`apps/web/public/assets/products`](../../apps/web/public/assets/products)   | 상품 사진                              |
| [`apps/web/public/assets/brand`](../../apps/web/public/assets/brand)         | 정적 워드마크 SVG                      |
| [`apps/web/public/assets/reference`](../../apps/web/public/assets/reference) | 이전 레퍼런스 원본 보관                |

향료와 도구의 경로 선택은 [`asset()`](../../apps/web/src/lib/assets.ts), 실시간 비커 표현은 [`vessel.tsx`](../../apps/web/src/components/illustrations/vessel.tsx), 화면 워드마크는 [`wordmark.tsx`](../../apps/web/src/components/brand/wordmark.tsx)에서 확인합니다. UI 버튼·선택 상태·진행률은 컴포넌트와 CSS로 구현합니다.

## 미리보기와 제작 기록

- [SVG 미리보기](svg-preview.html): 제작 당시 SVG 59종을 현재 자산 경로로 불러오는 정적 HTML입니다. 로컬 브라우저에서 열어 볼 수 있습니다.
- [SVG 제작 목록](svg-manifest.json): 미리보기에 포함된 파일의 제작 당시 분류입니다. 전체 자산의 현재 목록은 실제 `public/assets` 디렉터리를 기준으로 확인합니다.
- [향료 제작 시안](botanical-preview.jpg): 기존 향료 이미지의 비교용 시안입니다.
- [과거 SVG 작업 문서](../archive/SVG_ASSETS.md): 이전 제작 설명과 한계 기록입니다.

현재 향료 manifest에는 1680×1680 WebP가 기록되어 있습니다. 이전 420px 원본의 재샘플링 이력과 출처는 [전달본 QA 기록](../archive/QA_RESULTS_KO.md)에 있습니다. 리샘플링으로 원본에 없는 세부 정보가 생긴 것으로 해석하지 않습니다.

## 글꼴

현재 글꼴 설정은 [`apps/web/src/app/layout.tsx`](../../apps/web/src/app/layout.tsx)에 있습니다. Cormorant Garamond와 Noto Serif KR은 `next/font/google`로 빌드 시 준비하고, Pretendard는 브라우저의 외부 스타일시트로 불러옵니다. CSS의 시스템 글꼴 대체 설정과 [웹 글꼴 안내](../../apps/web/public/fonts/README.md)를 함께 확인하세요.
