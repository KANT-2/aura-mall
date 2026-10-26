# AURA 모노레포 작업 지침

## 구조

- `apps/web`: Next.js 프런트엔드, BFF, 웹 개발용 Mock API와 테스트
- `apps/api`: Python FastAPI 앱, 환경 설정, 라우터와 테스트
- `docs`: 제품 기획, QA 기록, FastAPI BFF 계약
- 루트: npm workspaces, 공통 포맷 설정, 저장소 안내와 작업 지침

웹 전용 지침은 [apps/web/AGENTS.md](apps/web/AGENTS.md)를 따릅니다. Next.js 코드를 수정하기 전에 설치된 `next` 패키지의 `dist/docs`에서 관련 문서를 읽습니다. 현재 의존성은 루트 `node_modules`에 설치됩니다.

## 브랜치와 PR

기본 흐름은 `작업 브랜치 → develop → main`입니다. `main`은 배포 가능한 안정 버전, `develop`은 다음 배포를 위한 통합·검증 브랜치입니다. 두 브랜치는 직접 push·강제 push·삭제를 차단하며 관리자에게도 보호 규칙을 적용합니다.

| 브랜치              | 용도                       | 생성 기준 | PR 대상   |
| ------------------- | -------------------------- | --------- | --------- |
| `feat/<작업명>`     | 기능 추가                  | `develop` | `develop` |
| `fix/<작업명>`      | 일반 버그 수정             | `develop` | `develop` |
| `refactor/<작업명>` | 구조 개선                  | `develop` | `develop` |
| `docs/<작업명>`     | 문서 변경                  | `develop` | `develop` |
| `chore/<작업명>`    | 설정·의존성·개발 도구 변경 | `develop` | `develop` |
| `hotfix/<작업명>`   | 운영 중 긴급 수정          | `main`    | `main`    |

- 새 작업은 최신 원격 기준 브랜치에서 분기합니다. `feat/web-cart`, `feat/api-login`처럼 작업 목적을 표시하고 PR 하나에는 한 가지 변경을 담습니다.
- 기존 개인 브랜치는 남은 변경을 확인해 작업별 브랜치로 옮깁니다. 다른 사람의 브랜치를 임의로 삭제하거나 강제 갱신하지 않습니다.
- 모든 PR은 작성자 이외의 팀원 1명 이상 승인을 받고 병합합니다. 새 커밋이 추가되면 기존 승인을 무효화하고 다시 리뷰받습니다.
- 작업 브랜치에서 `develop`으로 보내는 PR은 **Squash merge**로 병합하고 병합한 작업 브랜치는 삭제합니다. `main`과 `develop`은 유지합니다.
- 배포는 `develop → main` PR로 진행하고 **Merge commit**으로 병합합니다. 배포 버전은 `v0.1.0` 같은 태그로 기록하며, 배포 전 관련 사용자 흐름을 검증합니다.
- 긴급 수정은 `main`에서 분기한 `hotfix` 브랜치를 PR로 `main`에 병합합니다. 이후 `main → develop` PR을 **Merge commit**으로 병합해 수정 사항을 반영합니다. 긴급 수정도 리뷰와 관련 검증을 거칩니다.
- 장기 브랜치 사이의 동기화는 `main → develop` PR과 **Merge commit**을 사용합니다. `develop`이 뒤처진 상태에서는 동기화 후 새 작업을 시작합니다.
- PR에 변경 목적·영향 범위·검증 결과를 기록합니다. 웹과 API의 계약 변경은 [FastAPI BFF 계약](docs/FASTAPI_BFF.md)과 관련 구현을 함께 갱신합니다.
- 코드 변경은 로컬에서 `npm run check`, `npm run build`를 실행하고 PR에 결과를 기록합니다. 사용자 흐름 변경은 관련 E2E 결과를 추가로 기록합니다. 문서만 변경하면 포맷과 링크를 확인합니다.
- GitHub는 PR 대상별 병합 방식을 별도로 제한하지 않으므로 병합자가 위 방식을 확인합니다. 저장소에서는 Squash merge와 Merge commit을 허용하고 Rebase merge는 사용하지 않습니다.

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
