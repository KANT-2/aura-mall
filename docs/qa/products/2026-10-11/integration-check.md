# 상품 영역 통합 검수 — 2026-10-11

담당 영역: 전예진(상품 데이터·이미지·목록·상세·검색·필터·정렬·Quick View·관련 상품)
이 문서의 검수와 캡처는 Claude Code 에이전트가 자동화 브라우저로 수행했습니다. 전예진 님이 직접 수행한 검수는 포함하지 않습니다.

## 1. 확인한 환경

| 항목 | 값 |
|---|---|
| 브랜치 | `feature/yejin` |
| HEAD | `8e7a01c` Merge pull request #6 (2026-10-11 17:37 +0900) |
| 포함된 PR | #5 상품 탐색·상세·Quick View, #7 장바구니·포인트, #8 필터 호버, #6 Atelier·마이페이지 |
| 작업 전 git status | 미추적 파일 `docs/qa/products/2026-10-08/*.png` 15장뿐 (보존함) |
| 상품 수 | `data/products.ts` 기준 **6종** (12종 확장하지 않음) |
| 빌드 | `npm run build`: 성공, `/products/[id]` 6개 경로 정적 생성 |
| lint | `npm run lint`: 오류 0, 경고 5 (아래 §6) |
| 서버 | `next start -p 3123` (프로덕션 빌드), 응답 200 |
| 브라우저 | 헤드리스 Chrome 154, 새 빈 프로필(`%TEMP%\aura-qa-1011`), CDP로 조작 |
| 화면 크기 | 375×812(모바일 에뮬레이션), 768×1024, 1440×900/1000 |

기존 사용자 계정과 브라우저 저장 데이터는 건드리지 않았습니다. 별도 프로필에서 가상 회원 1명만 만들었습니다.
- 이름: `검수 테스트`
- 이메일: `qa.tester.<타임스탬프>@example.com` (예약 도메인)
- 카드 번호: `0000 0000 0000 0000` (가상 번호, Dew 등급으로 판별됨)

## 2. 검수 결과 요약

| 구분 | PASS | FAIL | 미실행 |
|---|---|---|---|
| 상품 목록 | 22 | 0 | 0 |
| Quick View | 7 | 0 | 0 |
| 상품 상세 | 30 | 0 | 0 |
| 반응형(CSS 화면 크기) | 7 | 1 | 실제 기기 |
| 이미지 실패 대체 표시 | 4 | 0 | 0 |
| **합계** | **70** | **1** | §7 참고 |

## 3. 항목별 결과

### 상품 목록
| 항목 | 결과 | 확인 내용 |
|---|---|---|
| 데이터와 카드 일치 | PASS | 6종의 이름·포인트·계열·이미지 파일·상세 링크가 `data/products.ts`와 일치 |
| 영문 검색 | PASS | `"  BERGAMOT "`(공백·대문자) → Bergamot Veil, `iris` → Bergamot Veil, `fig woody` → Fig Reverie |
| 한글 검색 | PASS | `우디` → Cedar Trace·Fig Reverie·Amber Dusk, `머스크` → Soft Skin, `플로럴` → Petal Haze |
| 검색어 삭제 | PASS | 활성 조건 칩 `“cedar” ×` 클릭 시 검색어가 비고 6종 복귀. 검색창에서 Esc를 눌러도 비워짐(Chrome의 `type=search` 기본 동작). 화면에 별도 '지우기' 버튼은 없음 |
| 향 계열 필터·URL | PASS | Woody 클릭 → `?family=Woody`, `aria-pressed=true`, 3종. `?family=musk`(소문자) → Soft Skin, `?family=citrus`(잘못된 값) → 전체 |
| 정렬 | PASS | 낮은 순 38,000 → 52,000, 높은 순 52,000 → 38,000 |
| 검색·필터·정렬 조합 | PASS | Woody + `wood` + 높은 순 → Amber Dusk, Fig Reverie, Cedar Trace |
| 빈 결과 | PASS | Woody + `rose` → "“rose” · Woody 계열 조건에 맞는 향이 없어요." 안내 |
| 조건 초기화 | PASS | 6종, URL 쿼리 없음, 기본순, 검색어 빈 값으로 복귀 |
| 필터 호버 | PASS | 미선택 Floral 배경 `transparent → #ece9e1`, 테두리 `#d8d4ca → rgba(27,27,25,.45)` |
| 마우스 이탈 시 복귀 | PASS | 원래 배경·테두리로 돌아옴 |
| 선택된 필터 유지 | PASS | 선택된 '전체'는 호버 중에도 `#1b1b19` 배경·흰 글자 |
| Tab·포커스·Enter | PASS | 검색창에서 Tab 2회 → Fresh에 `:focus-visible`, 2px 앰버(`#b77d3e`) 테두리. Enter → `?family=Fresh` 적용, 포커스 유지 |

### Quick View
| 항목 | 결과 | 확인 내용 |
|---|---|---|
| 키보드로 열기 | PASS | 미리보기 버튼에서 Enter → 대화상자 열림, 포커스는 '미리보기 닫기', 대화상자 이름 = "Cedar Trace" |
| 배경 스크롤 잠금 | PASS | 열린 동안 `html { overflow:hidden }` |
| 포커스 가두기 | PASS | Tab/Shift+Tab 6회 동안 '상세 보기'와 '미리보기 닫기' 사이에서만 이동 |
| Esc | PASS | 닫히고 실행 버튼으로 포커스 복귀, 스크롤 잠금 해제 |
| 닫기 버튼 | PASS | 닫히고 포커스 복귀 |
| 배경 클릭 | PASS | 닫히고 스크롤 잠금 해제 |
| 상세와 정보 일치 | PASS | 이름·계열·설명·TOP/HEART/BASE·포인트·이미지 경로가 상세 페이지와 동일 |

### 상품 상세
| 항목 | 결과 | 확인 내용 |
|---|---|---|
| 6종 정보 | PASS | 이름·포인트·`계열 · Eau de Parfum · 50mL`·노트 3개·이미지·페이지 제목 `{상품명} — AURA` |
| 수량 1에서 감소 비활성화 | PASS | 6종 모두 |
| 수량별 필요 포인트 | PASS | Cedar Trace 1개 46,000P → 2개 92,000P → 3개 138,000P |
| 로그인 안내 | PASS | 링크 `/login?next=%2Fproducts%2F<slug>`, 클릭 시 해당 주소로 이동 |
| 가입·로그인 후 복귀 | PASS | 가상 회원 가입 → `/products/petal-haze`로 복귀, 보유 포인트 10,000P 표시(Dew 가입 혜택) |
| 포인트 부족 | PASS | 수량 3 → "116,000P가 더 필요해요" 안내, 장바구니 담기는 막히지 않음 |
| 선택 수량 전달 | PASS | 비로그인 수량 3 담기 → 장바구니 저장 수량 3, 헤더 배지 3, '장바구니에 담았어요' 대화상자(정다라 영역) 표시, `/cart`에 Cedar Trace × 3 |
| 관련 상품 | PASS | 6종 모두 같은 계열 우선 → 기본 순서 보충, 자신 제외, 3개 |
| 관련 상품 이동·수량 초기화 | PASS | Cedar Trace(수량 2) → Fig Reverie 상세, 수량 1, 48,000P |
| 없는 주소 | PASS | `/products/no-such-scent`, `/products/1`, `/shop/no-such` → HTTP 404, "페이지를 찾을 수 없어요." |

### 반응형 (CSS 화면 크기 검증 — 실제 기기 아님)
| 항목 | 결과 | 확인 내용 |
|---|---|---|
| 375/768/1440 × `/products`, `/products/cedar-trace` (6건) | PASS | 가로 넘침 0px. 카드 내부 요소(번호·미리보기·이름 라벨) 겹침 없음. 제목·가격·필터·노트 글자 잘림 없음. 이미지 깨짐 0. 필터 행이 화면 안에 있음 |
| 375px 하단 고정 버튼·수량별 합계 | PASS | 화면 하단 고정, 수량 조절 노출, 본문 담기 버튼 숨김, "104,000P · 2개" |
| 375px 페이지 맨 아래 푸터 | **FAIL** | 하단 고정 버튼(y 739~812)이 푸터 저작권 두 줄(y 748~788)을 가림. `evidence/issue-sticky-cta-covers-footer-375.png` |

## 4. 이미지 실패 대체 표시 재현

- **방법**: 소스·이미지 파일은 바꾸지 않았습니다. CDP `Network.setBlockedURLs(["*aura-original*"])`로 상품 이미지 요청(`/_next/image?url=%2Fassets%2Faura-original…`)만 브라우저에서 차단하고, 캐시를 끈 채로 확인했습니다.

| 항목 | 결과 | 확인 내용 |
|---|---|---|
| 목록 카드 | PASS | 6개 모두 대체 표시(`AURA` + 상품명), 라벨 "<상품명> 이미지를 불러오지 못했어요", 카드 높이 동일, 가로 넘침 0 |
| Quick View | PASS | "Petal Haze" 대체 표시, 이미지 영역 높이 491px 유지 |
| 상세 갤러리·관련 상품 | PASS | 갤러리 "Soft Skin" 대체 표시, 높이 756px 유지, 관련 상품 3개도 대체 표시 |
| 차단 해제 후 새로고침 | PASS | 대체 표시 0, 상세 페이지 이미지 4개 정상 로드 |

- 근거 캡처: `evidence/fallback-list-1440.png`, `evidence/fallback-quickview-1440.png`, `evidence/fallback-detail-1440.png`
- 관찰: 대체 표시 중에는 상품명이 가운데 대체 표시와 하단 이름 라벨에 두 번 보입니다. 기능 문제는 아니고 시각적 중복입니다.

## 5. 발견한 문제와 담당

| # | 문제 | 담당 | 수정 제안 (이번 작업에서 수정하지 않음) |
|---|---|---|---|
| 1 | 375px 상세 맨 아래에서 하단 고정 버튼이 푸터 저작권 두 줄을 가림. 하단 여백이 `main.detail-page`(`padding-bottom:5.3rem`)에만 있고 그 뒤의 푸터에는 없음 | 전예진(하단 고정 버튼) + 고나경(푸터) 협의 | 모바일 미디어 쿼리 안에서 `body:has(.mobile-sticky-cta) .site-footer { padding-bottom: calc(24px + 5.3rem) }`처럼 상세 페이지일 때만 푸터 하단 여백 추가. 또는 고정 버튼 높이만큼 문서 끝에 여백 요소 추가 |
| 2 | 상품 보틀 이미지 3종을 6개 상품이 2개씩 나눠 씀. 태그 문구가 Atelier 레시피 이름(아래 목록) | 팀 결정 | §8 참고 |
| 3 | `AuraSite.tsx` 지갑 저장 코드(`AuraStateProvider`)와 `LocalAccount.ts`에 실제 이메일 형태의 값(`dara09@naver.com`)이 하드코딩됨. 개인정보·데모 계정 분기 가능성 | 정다라 | 실제 개인 이메일이라면 가상 값이나 환경 설정으로 대체 검토 |
| 4 | 대체 표시 중 상품명이 두 번 표시됨 | 전예진 | 대체 표시일 때 하단 이름 라벨을 숨기는 것을 검토 |
| 5 | 검색어 전용 '지우기' 버튼 없음(칩 ×와 Esc로 가능) | 전예진 | 필요하면 검색창 안에 지우기 버튼 추가 검토 |

## 6. lint 경고 (오류 0)

모두 상품 영역 밖이며, 이번 검수에서 수정하지 않았습니다.
- `components/AuraSite.tsx:4:3` @typescript-eslint/no-unused-vars
- `components/AuraSite.tsx:617:106` @next/next/no-img-element
- `components/AuraSite.tsx:628:9` @next/next/no-img-element
- `components/AuraSite.tsx:1170:23` @next/next/no-img-element
- `postcss.config.mjs:1:1` import/no-anonymous-default-export

## 7. 미실행 검수

- **실제 모바일 기기**(iOS Safari, Android Chrome): 하지 않았습니다. 375px은 Chrome 화면 크기 에뮬레이션입니다.
- **스크린리더**(NVDA, VoiceOver): 하지 않았습니다. 접근성 속성·`aria-live`·포커스 이동만 DOM으로 확인했습니다.
- **Safari·Firefox**: 하지 않았습니다(Chromium만 사용).
- **터치 환경의 호버 미적용**: 하지 않았습니다. 헤드리스 Chrome이 `hover` 미디어 에뮬레이션을 지원하지 않습니다.
- **실제 브라우저의 Tab 순환**: 헤드리스 기준입니다. 실제 브라우저에서는 Tab이 주소창 등 브라우저 UI로 갈 수 있습니다. 배경 페이지로 빠지지 않는 것은 `showModal()`의 inert 동작으로 보장됩니다.
- **검색창 네이티브 × 버튼 클릭**: 하지 않았습니다(Chrome 내부 Shadow DOM). 같은 기능을 Esc와 활성 조건 칩으로 확인했습니다.
- **장바구니 교환·포인트 차감**(정다라), **Atelier**(양성용) 내부 기능: 범위 밖입니다.
- 이미지 실패는 네트워크 차단으로만 재현했습니다. 손상된 파일이나 느린 네트워크는 확인하지 않았습니다.

## 8. 이미지 문제 목록 (교체하지 않음)

| 파일 | 사용 상품 | 문제 |
|---|---|---|
| `white-bottle.png` | Bergamot Veil, Soft Skin | 태그 문구 "CLEAR VEIL"(Atelier 레시피 이름), 두 상품이 같은 이미지 |
| `pink-bottle.png` | Petal Haze, Fig Reverie | 태그 문구 "PETAL SKIN", 원본 상단에서 캡이 잘림, 두 상품이 같은 이미지. Fig Reverie(Woody)가 핑크 보틀이라 계열 인상과 다름 |
| `amber-bottle.png` | Cedar Trace, Amber Dusk | 태그 문구 "WARM TRACE", 원본 상단에 작은 흰 얼룩(캡처에서도 보임), 두 상품이 같은 이미지 |

상품별 최종 이미지가 확정되면 새 파일을 추가하고 `data/products.ts`의 `imageUrl`만 바꾸면 됩니다. 기존 파일은 Atelier·장바구니에서도 쓰므로 덮어쓰지 않는 것을 권장합니다.

## 9. 캡처 파일

발표용 캡처입니다. 최종 상품 이미지가 아니며, 현재 개발 중인 1차 구현 화면입니다. 모두 비로그인 상태라 개인정보가 없습니다.

| 파일 | 크기 | 화면 |
|---|---|---|
| `desktop-products.png` | 1440×1000 | 상품 목록 (검색·필터·정렬, 첫 줄 카드 3개) |
| `desktop-filtered-products.png` | 1440×1000 | `wood` + Woody + 포인트 높은 순 → 3개, 활성 조건 칩 |
| `desktop-product-detail.png` | 1440×900 | Cedar Trace 상세, 수량 2 → 92,000P |
| `desktop-quick-view.png` | 1440×900 | Petal Haze Quick View (닫기 버튼에 키보드 포커스 표시) |
| `mobile-product-detail.png` | 375×812 | Petal Haze 상세 정보·노트·수량 2 → 84,000P, 하단 고정 버튼 "84,000P · 2개" |
| `evidence/fallback-*.png` (3장) | 1440×900 | 이미지 차단 시 대체 표시 (목록·Quick View·상세) |
| `evidence/issue-sticky-cta-covers-footer-375.png` | 375×812 | 문제 #1 재현 |

캡처 방법:
- 화면 크기 단위로 찍었습니다. 페이지 전체를 이어 붙이지 않아 고정 헤더가 중간에 반복되지 않습니다.
- 이미지 로드(`decode()`)와 폰트 로드가 끝난 뒤 촬영했습니다.
- 마우스는 화면 오른쪽 빈 여백에 두어 호버 상태가 생기지 않게 했습니다.
- 촬영 후 5장을 모두 직접 열어 잘림·빈 이미지·가려진 버튼이 없는지 확인했습니다.
