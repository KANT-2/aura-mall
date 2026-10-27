# 기존 Caddy를 사용하는 AURA 배포

서버에서 이미 실행 중인 공용 Caddy를 재사용합니다. AURA Compose는 Next.js·FastAPI·PostgreSQL만 실행하며 프록시 컨테이너나 인증서 저장소를 추가하지 않습니다.

```text
브라우저 ──HTTPS──▶ 기존 Caddy ──▶ Next.js 1 / Next.js 2 :3000
                                    │ BFF
                                    ▼
                             기존 Caddy :8080
                                    │ Docker DNS / round robin
                              ┌─────┴─────┐
                              ▼           ▼
                         FastAPI 1   FastAPI 2
                              └─────┬─────┘
                                    ▼
                            PostgreSQL :5432
```

공용 Caddy와 API·웹은 기존 외부 Docker 네트워크를 공유합니다. DB는 `aura-internal`에만 연결합니다. `compose.lb.yaml`을 적용하면 Next.js의 호스트 포트 매핑을 제거하고, BFF의 `API_URL`을 기존 Caddy의 내부 HTTP 리스너로 설정합니다. 공개 요청의 HTTPS 종료와 인증서 갱신은 기존 공용 Caddy가 담당합니다. 포트 8080은 호스트에 공개하지 않습니다.

## 서버 준비

Docker Compose 2.24.4 이상이 필요합니다. 기존 공용 Caddy가 연결된 네트워크와 DNS 이름을 확인하고 `.env`를 설정합니다.

```dotenv
APP_ORIGIN=https://mall.example.com
AURA_CADDY_NETWORK=caddy
AURA_API_PROXY_URL=http://caddy:8080
AURA_API_REPLICAS=2
AURA_WEB_REPLICAS=2
```

`APP_ORIGIN`은 실제 Next.js 공개 주소로 바꿉니다. Caddy가 공유 네트워크에서 `caddy`라는 DNS 이름을 갖지 않으면 `AURA_API_PROXY_URL`에 해당 컨테이너의 실제 DNS 이름을 사용합니다. 이 네트워크는 서버 운영자가 관리하며, 앱에서 삭제하거나 새로 만들지 않습니다.

[Caddy 설정 예제](../../caddy/aura.caddy)의 공개 호스트를 실제 주소로 바꿔 **기존 서버 Caddyfile에 사이트 블록을 추가**합니다. 기존 도메인·전역 설정을 보존합니다. 이 파일은 설정 예제이며 운영 Caddyfile을 저장소로 복사하지 않습니다.

공용 Caddy에 wildcard 사이트가 있으면 개별 호스트의 인증서 발급을 생략할 수 있으므로 웹 사이트에는 `tls force_automate`를 명시합니다. 기존 wildcard 정책을 변경하지 않고 해당 웹 호스트의 인증서를 자동 발급·갱신합니다. [Caddy Automatic HTTPS 기준](https://caddyserver.com/docs/automatic-https)

```sh
# 기존 공용 Caddy Compose 디렉터리에서 실행
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

파일을 bind mount로 사용하는 경우 기존 파일을 제자리에서 수정합니다. 호스트에서 원자 교체하면 컨테이너가 이전 파일을 계속 볼 수 있습니다. Caddy 컨테이너·80/443 매핑·인증서 볼륨은 유지합니다. 내부 API 리스너는 Docker DNS의 `aura-api` 별칭을 조회하므로 API 증감에 맞춰 설정을 다시 쓰거나 Caddy를 재시작할 필요가 없습니다. Next.js 복제본도 `aura-web` 별칭을 공유하여 분산합니다. Caddy 설정에 개별 컨테이너 이름을 나열하지 않습니다.

## 앱 시작과 배포

```sh
docker network inspect caddy
docker compose -f compose.yaml -f compose.lb.yaml config --quiet
docker compose -f compose.yaml -f compose.lb.yaml up -d --build
```

서비스는 `web`·`api`·`db`로 정의하고, 웹과 API는 같은 서비스의 복제 수로 관리합니다. 인스턴스나 서버마다 Compose 파일을 만들지 않습니다. `compose.lb.yaml`은 기존 Caddy에 연결하기 위한 공통 운영 설정입니다. DB 보안 구성을 사용하면 `compose.database.yaml`도 함께 지정합니다.

```sh
docker compose -f compose.yaml -f compose.database.yaml -f compose.lb.yaml up -d --build
python3 ops/database.py status
```

웹 수는 `.env`의 `AURA_WEB_REPLICAS`, API 수는 `AURA_API_REPLICAS`로 관리합니다. 한 개만 실행하려면 해당 값을 `1`로 바꾸고 같은 배포 명령을 실행합니다. 모든 복제본이 동일한 이미지와 환경 설정을 사용합니다. CD와 DB 운영 도구는 `compose.lb.yaml`이 있으면 함께 사용하여 다음 배포에서 공유 네트워크와 복제 수가 사라지지 않도록 합니다. CD는 DB 백업·마이그레이션 후 API와 웹을 배포하고, 설정한 수만큼 모든 복제본의 상태를 확인합니다. 정기 DB 비밀번호 회전은 앱 재시작 없이 수행합니다. 초기 카탈로그 적재는 자동 실행하지 않습니다.

이전의 별도 `web2` 서비스에서 전환할 때는 먼저 공용 Caddy의 웹 upstream을 `aura-web` DNS 별칭을 조회하는 예제로 바꿉니다. `.env`의 `COMPOSE_FILE`에 삭제된 파일을 직접 지정했다면 해당 항목도 제거합니다. CD는 배포 시 현재 Compose에 없는 이전 서비스를 정리합니다.

`develop → main` 배포 PR을 병합하면 `main` push 이벤트로 CD가 실행됩니다. 수동 실행은 `main` 또는 `develop`을 선택할 수 있습니다. 기존 `development` GitHub 환경의 서버·SSH 설정을 재사용하며, 해당 환경의 허용 브랜치에 배포할 브랜치를 등록해야 합니다. CD는 선택한 브랜치를 서버에 반영하고 실행을 시작한 커밋과 서버 HEAD가 같은지 확인한 후 백업·마이그레이션·배포를 진행합니다.

SSH로 전달하는 원격 스크립트는 배포 함수를 모두 읽은 후 표준 입력을 `/dev/null`로 바꿔 실행합니다. Docker 명령이 남은 스크립트를 입력으로 읽어, DB 상태 확인 뒤 나머지 배포가 생략되면서 성공으로 기록되는 상황을 방지합니다. `ops/test_deploy.py`가 입력을 읽는 Docker 대역으로 실제 배포 단계가 끝까지 실행되는지 검사합니다.

내부 Caddy는 TCP 연결 실패 시 다른 API로 연결할 수 있습니다. 연결 후 응답이 끊긴 요청의 재시도는 GET·HEAD·OPTIONS로 제한하여 처리된 POST 쓰기를 다시 보내지 않습니다. 진행 중인 응답에 별도의 짧은 제한 시간을 추가하지 않습니다.

## 검증

```sh
python3 ops/test_caddy.py
```

검증은 별도 임시 네트워크·컨테이너에서 실행합니다. 실제 공용 Caddy와 운영 앱을 변경하지 않습니다. 운영 Compose의 서비스가 `web`·`api`·`db`이고, 웹의 직접 호스트 포트와 DB의 공용 네트워크 연결이 없는지 확인합니다. 테스트용 공용 Caddy 하나를 재사용해 `브라우저 → Caddy → 웹/BFF → 같은 Caddy → API` 경로, 웹·API 각각 2→3→1 증감, 웹 한 개 중단 시 나머지 웹의 응답, Caddy 비재시작, POST 처리 후 연결이 끊겨도 쓰기가 한 번만 발생하는지를 검사합니다. CI에서도 동일하게 실행합니다.
