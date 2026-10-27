# FastAPI 계약 검사

저장소 루트에서 Node 의존성과 API 개발 의존성을 설치한 후 `npm run check:contract`를 실행합니다. DB·실행 중인 API·JWT 비밀값이 필요하지 않습니다. 로컬 uv 실행 파일 위치가 다르면 `UV_BIN`으로 지정할 수 있습니다.

- `operations.json`: 검토한 HTTP 메서드·경로 및 계약 버전. 경로 추가·제거 시 함께 검토합니다.
- `public-dtos.ts`: 생성 타입과 프런트 DTO·입력 계약의 컴파일 검사. BFF가 수행하는 nullable 선택 필드 정규화도 명시합니다.
- `generated/`: 운영 앱에서 내보낸 OpenAPI와 생성된 TypeScript 타입. 버전 관리하지 않습니다.

계약은 `aura_api.openapi.CONTRACT_VERSION`과 OpenAPI의 `info.x-contract-version`으로 식별합니다. 필수 필드·타입·인증 요구 등의 파괴적 변경은 주 버전을 올리고, 호환되는 API 추가는 부 버전을 올립니다. 작업 목록이나 타입 검사를 변경할 때에는 대응하는 BFF 어댑터와 회귀 테스트도 검토합니다.

일반 웹 빌드는 Python을 요구하지 않습니다. 별도 계약 검사는 `npm run check:contract` 또는 루트 `npm run check`로 로컬에서 실행합니다.
