# V3 주의: 아래 목록은 과거 제작 기록입니다.

현재 향료 24종은 `/assets/botanical/*.webp`에서, SVG 도구는 `/assets/editorial/*.svg`에서 사용합니다. `/assets/reference`는 이전 원본 보관용이며 실사용하지 않습니다. `START_HERE_KO.md` 및 `public/assets/botanical-manifest.json` 참조.

---

# AURA 투명 SVG 에셋

총 59개. 향료 24개, 비커 9개 파일(기존 번호 호환 포함), 컬렉션 3개, 도구·보틀·결과·모션·유틸리티 23개.

비커는 두 번째 레퍼런스의 유리 실린더·우드 받침 형태, 향료·보틀·도구는 첫 번째 레퍼런스의 절제된 재질·레이어를 기준으로 새로 그렸습니다. 픽셀 단위 복제가 아닌 실제 벡터 재구성입니다. 전체 배경 사각형이 없고, 사진을 포함한 image 태그도 없습니다. 도구별 cap/body/label/handle, 비커별 glass-body/liquid/highlight/wood-base/shadow 등 이름 있는 그룹을 분리합니다.

UI 칩·카운터·선택 상태·진행률·버튼·내비게이션은 React/CSS 요소입니다. 조작부를 이미지로 대체하지 않습니다. 라이브 비커는 components/ui/Vessel.tsx와 Shared.tsx에서 수량·색·방울 상태를 갱신합니다.

## 파일 목록

- `amber.svg`
- `apple.svg`
- `beaker-0.svg`
- `beaker-1.svg`
- `beaker-2.svg`
- `beaker-3.svg`
- `beaker-4.svg`
- `beaker-5.svg`
- `benzoin.svg`
- `bergamot.svg`
- `cardamom.svg`
- `cedarwood.svg`
- `ceramic-bottle.svg`
- `collection-fresh.svg`
- `collection-soft.svg`
- `collection-warm.svg`
- `coupon.svg`
- `custom-bottle.svg`
- `diffuser-bottle.svg`
- `droplet.svg`
- `dropper.svg`
- `empty-bag.svg`
- `flask.svg`
- `fragrance-trail.svg`
- `funnel.svg`
- `gift.svg`
- `grapefruit.svg`
- `jasmine.svg`
- `lavender.svg`
- `lemon.svg`
- `mandarin.svg`
- `mixing-guide.svg`
- `muguet.svg`
- `neroli.svg`
- `paper-label.svg`
- `paper-tag.svg`
- `peach.svg`
- `peppermint.svg`
- `pink-pepper.svg`
- `ripple.svg`
- `rose.svg`
- `rosemary.svg`
- `round-bottle.svg`
- `sandalwood.svg`
- `scent-strip.svg`
- `spoon.svg`
- `spray-head.svg`
- `spray-particles.svg`
- `spray.svg`
- `tonka.svg`
- `travel-bottle.svg`
- `vanilla.svg`
- `vetiver.svg`
- `white-musk.svg`
- `wood-cap.svg`
- `ylang.svg`

추가·갱신한 상태: beaker-0, beaker-1, beaker-5, beaker-10, beaker-20, beaker-mixing. 각 숫자는 투입 횟수이며, 기존 beaker-2/3/4 파일은 이전 호환용입니다. 라이브 화면은 연속적인 높이와 선택한 색을 사용합니다.
