# 과거 구현과 QA 기록

아래 문서는 작성 당시 구현·전달·검수의 근거입니다. 본문의 현재·최신이라는 표현, 경로, 실행 명령과 PASS 결과도 당시 상태를 가리킵니다. 현행 개발 절차와 구현 범위는 [문서 목록](../README.md)의 안내를 기준으로 확인합니다.

## 구현과 디자인 이력

| 기록 | 범위 |
| --- | --- |
| [V3 전달본 안내](QA_AURA_V3_20261013.md) | 2026-10-13 ZIP 적용과 수동 검수 |
| [V4 레퍼런스 UI](AURA_V4_REFERENCE_UI_IMPLEMENTATION.md) | 조향·재료·보틀 UI 구현과 당시 한계 |
| [V5 혼합·결과 개선](AURA_V5_BLEND_RESULT_FIX_QA.md) | 젓기·라벨·공유·결과 화면 수정 |
| [V6 타이포그래피](AURA_V6_BRAND_TYPOGRAPHY_CHANGELOG.md) | 워드마크와 글꼴 변경 |
| [UI/UX 업데이트](UIUX_UPDATE_20261013.md) | 2026-10-13 조향 경험·레이아웃 기록 |
| [다크 아틀리에 작업](QA_ATELIER_DARK_20261013.md) | 다크 스타일 적용과 미검증 범위 |
| [인터랙션 적용표](REFERENCE_INTERACTION_MAPPING_KO.md) | 2026-10-23 전달본의 레퍼런스·상호작용 매핑 |
| [SVG 제작 설명](SVG_ASSETS.md) | 과거 자산 목록과 표현 방식 |

ZIP 적용 스크립트와 이전 파일 구조에 관한 내용은 과거 전달본에 대한 설명입니다. 현재 모노레포의 설치 명령은 [루트 README](../../README.md)에 있습니다.

## 검수 보고서와 원본

| 기록 | 범위 |
| --- | --- |
| [이전 검수 보고서](QA_REPORT.md) | 2026-10-13 이전·업데이트 당시 결과 |
| [전달본 적용·검수](QA_RESULTS_KO.md) | 2026-10-23 전달본과 2026-10-24 로컬 통합 검사 |
| [기능 결과 JSON](functional-qa.json) | 초기 기능 시나리오 결과 |
| [레이아웃 결과 JSON](layout-qa.json) | 초기 화면별 레이아웃 결과 |
| [후속 기능 결과 JSON](refined-functional-qa.json) | 후속 전달본에 포함된 기능 결과 |
| [후속 레이아웃 결과 JSON](refined-layout-qa.json) | 조향 단계·높이별 후속 화면 결과 |

두 기능 JSON의 내용은 같지만 당시 파일명과 전달본 참조를 보존합니다. 이 자료를 현재 코드에 대해 다시 실행한 테스트 결과로 표시하지 않습니다. 현재 검사 명령은 [웹 검증](../../apps/web/README.md#검증)과 [API 검증](../../apps/api/README.md#검증과-의존성-변경)을 참고하세요.
