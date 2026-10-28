# AURA 문서 목록

현재 개발에 사용하는 문서와 과거 구현·검수 기록을 구분합니다. 설치와 앱 실행은 [저장소 README](../README.md)에서 시작합니다.

## 현재 기준

| 문서                                       | 내용                                         |
| ------------------------------------------ | -------------------------------------------- |
| [제품 기획](product/PRD.md)                | 서비스 범위·상품 정책·화면·사용자 경험       |
| [웹 개발 안내](../apps/web/README.md)      | Next.js·BFF·Mock·훅·CSS·웹 검증              |
| [API 개발 안내](../apps/api/README.md)     | FastAPI 설치·설정·라우터·Python 검증         |
| [FastAPI BFF 계약](FASTAPI_BFF.md)         | 업무 API의 입력·응답·세션·오류·연결 기준     |
| [백엔드 요구사항](backend/REQUIREMENTS.md) | 백엔드 기능·비기능 요구사항·인수 기준        |
| [백엔드 설계서](backend/DESIGN.md)         | 구조·API·JWT 인증·트랜잭션·인프라 설계       |
| [백엔드 ERD](backend/ERD.md)               | 백엔드 테이블·관계·제약 설계(초안)           |
| [도메인 규칙](backend/DOMAIN_RULES.md)     | 회원·조향·주문·문의 업무 규칙(초안)          |
| [에셋 안내](assets/README.md)              | 현재 자산 위치·목록·미리보기·글꼴            |
| [DB 운영 안내](operations/DATABASE.md)     | TLS 자동 갱신·접속 비밀번호 회전·복제·복구   |
| [Caddy 배포 안내](backend/DEPLOYMENT.md)   | 기존 Caddy 재사용·Next.js 공개 경로·API 분산 |

제품 기획은 목표 정책과 경험을 정의합니다. 실제 구현 범위는 앱별 README와 소스, API 구현 시 준수할 통신 규칙은 BFF 계약을 기준으로 확인합니다. 운영 웹은 Next.js BFF를 통해 FastAPI와 PostgreSQL을 사용합니다. 로컬 웹 개발의 기본값은 Mock이며, 실제 DB 기반 브라우저 검증은 별도 commerce suite를 사용합니다.

[기능 연결 점검·보완 기록](FEATURE_PARITY.md)과 [주문·결제 운영 안내](operations/COMMERCE.md)에서 현재 연결 범위와 자동 처리 작업을 확인합니다.

[시연 데이터 적재](operations/DEMO_DATA.md)에서 가상 회원·주문·문의 구성과 체험 계정 사용법을 확인합니다.

## 과거 기록

[보관 문서 목록](archive/README.md)에는 버전별 UI 작업, 전달본 적용, 과거 QA 보고서와 JSON 원본이 있습니다. 작성 당시의 파일명·명령·검수 결과를 보존하며, 현재 코드의 검증 결과로 간주하지 않습니다.

## 문서 유지 기준

- 실행·설정·구현 범위가 바뀌면 해당 앱 README와 필요한 계약을 갱신합니다.
- 새 업무 API는 BFF 계약과 실제 OpenAPI·테스트를 함께 맞춥니다.
- 시점에 종속되는 QA와 변경 이력은 `archive`에 두고 작성 시점·검증 범위를 명시합니다.
- 문서를 이동할 때는 Markdown 링크와 HTML 미리보기의 자산 경로를 함께 수정합니다.
- 제품 기획의 세부 정책을 개발 안내에 중복 작성하지 않습니다.
