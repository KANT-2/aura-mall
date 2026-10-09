# 상품 영역 QA 보고서 — 2026-10-08

- 담당: 전예진 (상품 데이터·이미지·목록·상세·검색·필터·정렬·Quick View·관련 상품)
- 브랜치: `feature/yejin` (기준 커밋 `a6afb5b`), **미커밋 상태**
- 상태 구분: 아래 내용은 모두 **1차 구현**입니다. 각 항목의 PASS는 자동화 브라우저 검증 결과이며, Redmine 일감의 최종 완료 판단은 팀 확인 후 진행합니다.

## 1. 변경 내용

### 신규 — `components/products/`
| 파일 | 내용 |
|---|---|
| `catalog.ts` | 검색(이름·노트·계열 영문/한글, trim, 대소문자 무시, 여러 단어 AND)·계열 필터·정렬(기본/낮은/높은 순, 안정 정렬, 원본 비변경), 관련 상품 선정, URL `family` 해석, 상품 수 문구 |
| `ProductCard.tsx` | 상품 카드. 상세 링크와 미리보기 버튼을 형제 요소로 분리(링크 안 버튼 없음). 홈에서는 미리보기 버튼 미표시 |
| `ProductImage.tsx` | `next/image`로 데이터의 `imageUrl` 렌더링, `object-fit: contain`, 로드 실패 시 상품명 대체 표시 |
| `ProductCollection.tsx` | 컬렉션 상단·검색/필터/정렬·결과 수·활성 조건·초기화·빈 결과 |
| `ProductDetail.tsx` | 상세(정보 위계 정리, 노트 요약, 수량, 장바구니 담기, 로그인 안내, 포인트 부족 안내), 향 노트, 관련 상품 |
| `QuickView.tsx` | 네이티브 `<dialog>` 미리보기 |
| `ProductIcon.tsx` | 상품 화면 아이콘 4종 (AuraSite import 시 순환이 생겨 별도 보관) |

### 수정
| 파일 | 내용 |
|---|---|
| `data/products.ts` | `imageUrl`을 에셋 보드에서 개별 PNG로 변경, `volume`·`concentration` 추가, `scentFamilies`·`findProductBySlug` 추가. ID·slug·이름·가격·노트·설명은 변경 없음 |
| `types/product.ts` | `volume`·`concentration` 필드 추가 |
| `app/products/[id]/page.tsx` | slug 해석 유지, 상품별 `generateMetadata` 추가 |
| `components/AuraSite.tsx` (공유) | `ProductCard`·`CollectionPage`·`ProductDetailPage` 본문을 상품 컴포넌트로 이동. 남은 코드는 `useAppState()`에서 `addToCart`·`points`·로그인 여부만 넘기는 연결 함수입니다. Provider·장바구니·홈·MY AURA 배너는 변경하지 않았습니다. `CAN'T` 따옴표를 이스케이프했습니다. |
| `app/globals.css` (공유) | 기존 규칙은 변경하지 않음. 파일 끝에 `PRODUCTS` 구역 72줄 추가 |

### 동작 변경 요약
- 정렬 '추천순'을 '기본순'으로 변경 (선정 근거가 없었음)
- 향 계열 필터가 URL `?family=`을 기준으로 동작합니다. 이전에는 처음 진입할 때 한 번만 읽고, 그 뒤 URL이 바뀌어도 반영되지 않았습니다.
- '여섯 가지', '50mL' 문구를 데이터에서 계산
- 상세의 01·02·03 장식 썸네일 제거 (전환할 이미지 없음)
- 수량이 1일 때 감소 버튼 비활성화, 모바일에서도 수량을 조절할 수 있음
- 관련 상품으로 이동하면 수량이 1로 초기화됨 (이전에는 앞 상품의 수량이 남던 버그)
- 관련 상품: 같은 계열을 먼저 고르고 기본 순서로 보충, 자신·중복 제외, 최대 3개. 안내 문구를 선정 기준에 맞춤

## 2. 실제 검증 결과

검증 환경은 다음과 같습니다.
- 서버: `next build` 후 `next start` (port 3123)
- 브라우저: 헤드리스 Chrome 154를 CDP로 자동 조작
- 화면 너비: 375 / 768 / 1440px

| 항목 | 결과 | 근거 |
|---|---|---|
| `npm run build` | PASS | `/products/[id]` 6종 SSG 생성 |
| `npm run lint` | 오류 1건 남음 (기존, 타 담당) | 작업 전: 오류 2, 경고 10 → 작업 후: 오류 1, 경고 9. 상세는 §4 |
| 가로 넘침 (목록·상세·홈 × 3개 너비) | PASS | `scrollWidth − innerWidth = 0` |
| 상품 이미지 로드·비율 | PASS | 목록 6개, 상세 4개, 홈 3개 모두 정상. 깨진 이미지 0, 대체 표시 0, 모두 `contain` |
| 목록 ↔ 상세 일치 (6종) | PASS | 이름·포인트·설명·이미지 경로 일치, 페이지 제목 `{상품명} — AURA` |
| 없는 주소 | PASS | `/products/no-such-scent`, `/products/1`, `/shop/no-such`: 응답 404, 기존 404 화면 표시 |
| 검색 | PASS | `"  BERGAMOT "`→1, `woody`/`우디`→3, `musk`→2, `fig woody`→1, `iris`→1 |
| 필터 + 정렬 + 검색 조합 | PASS | Woody + 높은/낮은 순 + `amber` → Amber Dusk |
| 정렬 결과 | PASS | 전체 낮은 순: 38,000 → 40,000 → 42,000 → 46,000 → 48,000 → 52,000 |
| 빈 결과·초기화 | PASS | 안내 문구에 조건 표시. 초기화하면 6개 표시, URL·정렬·검색어 모두 초기화 |
| URL 처리 | PASS | `?family=woody`→3, `?family=bogus`→전체, `/shop?family=Floral`→Petal Haze, 헤더 '컬렉션' 링크로 필터 해제 |
| 관련 상품 | PASS | 6종 모두 자신·중복 제외 3개. 예: cedar-trace → Fig Reverie, Amber Dusk, Bergamot Veil |
| 수량·장바구니 담기 | PASS | 수량 3으로 담기 → 장바구니 수량 3, 헤더 배지 3, 장바구니 화면에 표시 |
| 로그인 전후 | PASS | 비로그인 시 `/login?next=%2Fproducts%2F…` 링크. 회원가입 후 상세로 복귀해 잔액 0P 표시, 부족 안내가 나와도 담기 가능 |
| Quick View (1440·375) | PASS | Enter로 열림, 포커스가 대화상자 안에 있음, 상품명으로 이름 지정, 배경 스크롤 잠금, Tab/Shift+Tab이 대화상자 밖으로 나가지 않음, Esc·닫기 버튼·배경 클릭으로 닫힘, 닫은 뒤 실행 버튼으로 포커스 복귀, 패널 내부 클릭은 유지, 상세 링크로 이동 |
| 모바일 하단 고정 버튼 (375) | PASS | 화면 하단 고정, 수량 표시, 선택한 수량(2개 · 96,000P)으로 담김 |
| 홈 ProductCard 회귀 | PASS | 카드 3개, 상세 링크 정상, 미리보기 버튼 없음 |
| 다른 페이지 렌더링 | PASS (기본 렌더링만 확인) | `/`, `/cart`, `/custom`, `/cards`, `/login`, `/signup`, `/mypage`에서 헤더·main 정상 |

검증 중 발견해 수정한 문제:
- Tailwind 기본 스타일이 `<dialog>`의 `margin:auto`를 없애 Quick View가 좌상단에 붙어 있었습니다. `.quick-view { margin:auto }`로 수정했습니다.

## 3. 미실행·한계

- 실제 스크린리더(NVDA·VoiceOver)로는 확인하지 않았습니다. 접근성 속성과 `aria-live`는 마크업 수준에서만 확인했습니다.
- 실제 모바일 기기, Safari·Firefox는 확인하지 않았습니다. Chromium 에뮬레이션만 사용했습니다.
- Quick View의 Tab 순환은 헤드리스 Chrome 기준입니다. 실제 브라우저에서는 Tab이 주소창 등 브라우저 UI로 이동할 수 있습니다. 배경 페이지로 이동하지 않는 것은 `showModal()`의 inert 동작으로 보장됩니다.
- 이미지 로드 실패 시 대체 표시는 코드로만 구현했습니다. 실제로 이미지 경로를 깨뜨려 보는 테스트는 하지 않았습니다.
- 장바구니·Atelier·카드·마이페이지 내부 기능 회귀는 담당 범위 밖이라 렌더링만 확인했습니다.
- 한글 줄바꿈은 스크린샷 육안 확인에 그쳤습니다(`word-break: keep-all` 기존 적용).

### 스크린샷 (이 폴더)
- `view-*`: 화면 크기 캡처 (목록, 상세, 모바일 하단 고정 버튼, Quick View)
- `full-*`: 페이지 전체 캡처
  - 캡처 방식 때문에 고정 헤더가 페이지 중간에 그려져 있습니다. 실제 화면 문제는 아닙니다.
  - `full-375-home.png`는 9000px에서 잘렸습니다.
- 모든 캡처는 비로그인 상태입니다. 테스트 계정 정보가 담긴 캡처는 없습니다.

## 4. 남은 lint 오류 (수정하지 않음 — 정다라 담당 Provider)

```
components/AuraSite.tsx:1465:18
rule: react-hooks/set-state-in-effect
message: Error: Calling setState synchronously within an effect can trigger cascading renders
```

- 위치는 `AuraProviders`의 첫 `useEffect` 안, `setUser(restored)` 호출입니다.
- 작업 전과 같은 코드입니다. 작업 전에는 1717행이었고, 위쪽 상품 코드를 옮기면서 줄 번호만 바뀌었습니다.
- 해결 방향(제안): 저장된 상태를 `useState` 초기화 함수나 `useSyncExternalStore`로 읽는 방법이 있습니다. 결정은 담당자에게 맡깁니다.

남은 경고 9건도 모두 기존 경고입니다.
- `<img>` 사용: 홈·Atelier·BlendVessel
- 미사용 변수: Atelier `stageIndex`·`groupIndex`
- `postcss.config.mjs` 익명 default export

이 중 상품 영역 경고는 없습니다.

## 5. 이미지 문제

| 파일 | 문제 | 사용 상품 |
|---|---|---|
| `white-bottle.png` | 태그 문구 **CLEAR VEIL** (Atelier 레시피 이름), 2개 상품이 같은 이미지 사용 | Bergamot Veil, Soft Skin |
| `pink-bottle.png` | 태그 문구 **PETAL SKIN**, 원본 상단에서 캡이 잘림(투명 영역이 y=0부터 시작), 2개 상품이 같은 이미지 사용 | Petal Haze, Fig Reverie |
| `amber-bottle.png` | 태그 문구 **WARM TRACE**, 상단에 작은 흰 얼룩, 2개 상품이 같은 이미지 사용 | Cedar Trace, Amber Dusk |

- 같은 PNG를 Atelier 보틀과 장바구니도 사용합니다. 그래서 파일을 덮어쓰지 말고 상품별 새 파일을 추가한 뒤 `data/products.ts`의 `imageUrl`만 바꾸는 방식을 권장합니다.
- 이미지 3종 모두 내용이 원본 가운데에서 약간 치우쳐 있습니다. 상품 화면은 여백으로 보정했습니다.

## 6. 팀 결정 대기

1. 상품 수 6종 / 12종: 현재 6종 유지. 상품 수 문구는 자동으로 따라갑니다.
2. 상품별 개별 보틀 이미지 제작 여부 (§5)
3. Cedar Trace의 향 이야기에 '앰버'가 나오지만 노트(Juniper/Suede/Cedarwood)에는 없음: 문구와 노트 중 어느 쪽을 기준으로 할지
4. '재활용 가능한 종이 패키지' 표현의 근거 (기존 문구 유지 중)
5. '50mL / Eau de Parfum': 기존 화면 값을 데이터로 옮긴 것으로, 실제 기획값 확인 필요
6. AuraSite `Icon`과 상품 `ProductIcon` 중복 정리 방식 (고나경)
7. 장바구니 수량 감소 버튼도 1에서 비활성화할지 (정다라)
