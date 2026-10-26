# AURA 모노레포 작업 지침

## 구조

- `apps/web`: Next.js 프런트엔드, BFF, 웹 개발용 Mock API와 테스트
- `apps/api`: Python FastAPI 앱, 환경 설정, 라우터와 테스트
- `docs`: 제품 기획, QA 기록, FastAPI BFF 계약
- 루트: npm workspaces, 공통 포맷 설정, 저장소 안내와 작업 지침

웹 전용 지침은 [apps/web/AGENTS.md](apps/web/AGENTS.md)를 따릅니다. Next.js 코드를 수정하기 전에 설치된 `next` 패키지의 `dist/docs`에서 관련 문서를 읽습니다. 현재 의존성은 루트 `node_modules`에 설치됩니다.

## 코드와 의존성

- TypeScript 소스 참조는 `@/` 별칭을 사용합니다.
- JavaScript·TypeScript의 `if`·`for`에는 블록을 사용합니다. 문 앞에는 빈 줄을 넣지 않고 블록 뒤에는 빈 줄을 둡니다. 연속된 블록 사이에는 빈 줄을 둡니다.
- Python 코드는 `apps/api/pyproject.toml`의 Ruff 규칙을 따릅니다.
- Node 의존성은 루트의 `package-lock.json`, Python 의존성은 `apps/api/uv.lock`으로 관리합니다. 의존성 선언을 변경하면 해당 잠금 파일도 갱신합니다.
- 업무 API의 기준은 [docs/FASTAPI_BFF.md](docs/FASTAPI_BFF.md)입니다. 현재 웹 개발의 기본 백엔드는 Mock입니다.
- 생성 파일, 캐시, 가상 환경과 로컬 환경 변수는 버전 관리하지 않습니다.

## 검증

아래 명령은 저장소 루트에서 실행합니다.

```sh
npm run check:web
npm run check:api
npm run check
npm run build
```

웹·API 개발과 초기 설치 방법은 [README.md](README.md)를 참고합니다.
