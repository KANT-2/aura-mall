## 3. 배포 구조 설계안

### 확정된 구성

- 개발 서버의 기존 Caddy 컨테이너 재사용
- Next.js, FastAPI, PostgreSQL은 AURA 전용 Docker 컨테이너로 각각 구성
- FastAPI는 `apps/api`, Next.js는 `apps/web`의 기존 프로젝트 구조를 기반으로 구성

### 서비스 요청 흐름

사용자 브라우저 → 기존 Caddy → AURA Next.js(BFF) → AURA FastAPI → AURA PostgreSQL

### 도메인 및 라우팅 제안

- AURA 전용 서브도메인을 사용한다.
- 기존 Caddy에서 AURA 도메인 요청을 Next.js 컨테이너로 전달한다.
- Next.js BFF는 내부 네트워크를 통해 FastAPI로 요청을 전달한다.
- 실제 도메인과 Caddy 설정 적용 방법은 기존 서버 구성을 확인한 후 확정한다.

## 4. Docker 구성 계획

### AURA 전용 컨테이너

- `aura-web`: Next.js 프론트엔드 및 BFF
- `aura-api`: FastAPI 백엔드
- `aura-db`: PostgreSQL 데이터베이스

### 네트워크 구성 제안

- 프록시 연결 네트워크: 기존 Caddy와 Next.js 사이의 통신
- AURA 내부 네트워크: Next.js, FastAPI, PostgreSQL 사이의 통신
- PostgreSQL 포트는 외부에 공개하지 않는다.
- 기존 Caddy 네트워크 이름 및 연결 가능 여부는 서버 설정 확인 후 결정한다.

### 데이터 및 환경변수 관리

- PostgreSQL 데이터는 AURA 전용 Docker 볼륨으로 유지한다.
- DB 접속 정보는 환경변수로 관리한다.
- 비밀번호 등 비밀정보는 GitHub에 올리지 않는다.
- 기존 Caddy 컨테이너와 볼륨은 임의로 수정하거나 삭제하지 않는다.
