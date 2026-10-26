# AURA 섹션별 인터랙션 레퍼런스 적용표

> 보관 기록입니다. 구현·경로·명령·검증 결과는 작성 당시 기준입니다. 현재 개발 방법은 [문서 목록](../README.md)에서 확인하세요.

팀 전달본 기준: `develop` 커밋 `de182f357f5440e9edd41043f94036448426f3ec` (2026-10-23).

사용자가 공유한 인터랙션 레퍼런스 카탈로그(Posts.design, Refero, Refs.Gallery, Landing.love, Design Spells, 60fps.design, Motion Primitives, React Bits, Aceternity UI 등) 가운데
**아래 문서는 실제로 공개된 상호작용 패턴을 확인하고 그 원칙을 AURA에 맞춰 새로 구현한 항목**입니다.
사이트에서 내려받은 제3자 코드·이미지를 복사한 것이 아닙니다. 파일 열은 CSS·컴포넌트 분리 후의 현재 경로를 반영합니다.

| AURA 섹션 | 레퍼런스 | 적용한 반응 | 파일 |
|---|---|---|---|
| 홈 히어로 | Motion Primitives — InView/Text Effect | 텍스트·CTA 순차 진입, 작은 거리의 부드러운 이동 | AuraMotionEnhancer / Home.module.css |
| 홈 CTA | Motion Primitives — Magnetic | 마우스 방향으로 최대 5px 이동, 포인터를 떼면 원위치 | AuraMotionEnhancer |
| 홈 컬렉션 | React Bits — Animated Content | 카드별 스크롤 진입·그림 애셋 미세 상승 | Home.module.css |
| 홈 프로모션 | Motion Primitives — Carousel; 60fps — Swipe | 이전/다음/화살표 키/모바일 좌우 스와이프, 텍스트 전환 | Home.tsx |
| 베스트셀러 | 60fps — carousel/snap/drag feedback | 수평 스크롤 스냅, 카드 호버/포커스 확대 | Home.module.css / styles/components.css |
| Shop / Collection | React Bits — Animated Content | 필터 선택 강조와 제품 목록 진입 효과 | AuraMotionEnhancer / Shop.tsx / Commerce.module.css |
| 상품 상세 | 60fps — image detail/showcase patterns | 실제 develop 제품 사진 확대 모달(네이티브 dialog·Esc 닫기) | ProductDetail.tsx / Commerce.module.css |
| 상품 상세 탭 | 60fps — tabs and state | 기존 키보드 접근 가능한 탭 유지, 절제된 전환 강조 | ProductDetailContentDock |
| Gift Set | 60fps — selected/success state | 실물 제품 3개 선택 시 슬롯 애니메이션과 합산 가격 | ProductDetail.tsx / Commerce.module.css |
| Atelier 선택 | 60fps — tap/selection micro-interactions | 선택 카운터/향료 비율/칩 전환과 모바일 터치 | Atelier.tsx / Atelier.module.css |
| Atelier PC 젓기 | 60fps — Drag/Gesture | 막대의 마우스 위치 추종, 액체 스월·지연·누적 진행률 | useBlend.ts / Vessel.tsx |
| Atelier 휴대폰 흔들기 | 60fps — Gyroscope/Gestures | 권한 요청 → 막대 숨김 → 센서 기반 비커/수면 기울기 → 누적 섞기 | useDeviceMotion.ts / motion.ts / Vessel.tsx |
| Cart / Account | 60fps — state feedback | 카드 강조·탭/폼 상태·절제된 클릭 반응 | Commerce.module.css / Account.module.css |

**레퍼런스 확인 URL**

- https://motion-primitives.com/docs/in-view
- https://motion-primitives.com/docs/text-effect
- https://motion-primitives.com/docs/magnetic
- https://motion-primitives.com/docs/carousel
- https://reactbits.dev/animations/animated-content
- https://60fps.design/shots/filter

**디자인 적용 원칙**

- AURA의 실제 제품 사진, 색상 및 타이포 유지. 밝은 홈/스토어와 어두운 아틀리에를 별도의 분위기로 운영.
- 배지·토큰·상태는 이미지 에셋이 아니라 컴포넌트. 공통 UI 아이콘은 선형 SVG.
- 타사 서비스의 눈에 띄는 색상과 3D 스프링을 그대로 복사하지 않음.
- 움직임이 구매, 선택, 스크롤, 저장 흐름을 방해하지 않아야 함.
- 기기 배터리, 스크롤 성능 및 접근성 우선. Reduce Motion 존중.

**추가 작업/제외**

- 결제 게이트웨이 / 실제 주문 처리는 연동 정보가 없어 구현하지 않음.
- 화려한 WebGL 파티클, 긴 페이지 전환 애니메이션, 타 브랜드 로고/소스 복사는 의도적으로 제외.
