# 기존 Caddy를 사용하는 AURA 배포

서버에서 이미 실행 중인 공용 Caddy를 재사용합니다. AURA Compose는 Next.js·FastAPI·PostgreSQL만 실행하며 프록시 컨테이너나 인증서 저장소를 추가하지 않습니다.

```text
브라우저 ──HTTPS──▶ 기존 Caddy ──▶ Next.js :3000
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
```

`APP_ORIGIN`은 실제 Next.js 공개 주소로 바꿉니다. Caddy가 공유 네트워크에서 `caddy`라는 DNS 이름을 갖지 않으면 `AURA_API_PROXY_URL`에 해당 컨테이너의 실제 DNS 이름을 사용합니다. 이 네트워크는 서버 운영자가 관리하며, 앱에서 삭제하거나 새로 만들지 않습니다.

[Caddy 설정 예제](../../caddy/aura.caddy)의 공개 호스트를 실제 주소로 바꿔 **기존 서버 Caddyfile에 사이트 블록을 추가**합니다. 기존 도메인·전역 설정을 보존합니다. 이 파일은 설정 예제이며 운영 Caddyfile을 저장소로 복사하지 않습니다.

공용 Caddy에 wildcard 사이트가 있으면 개별 호스트의 인증서 발급을 생략할 수 있으므로 웹 사이트에는 `tls force_automate`를 명시합니다. 기존 wildcard 정책을 변경하지 않고 해당 웹 호스트의 인증서를 자동 발급·갱신합니다. [Caddy Automatic HTTPS 기준](https://caddyserver.com/docs/automatic-https)

```sh
# 기존 공용 Caddy Compose 디렉터리에서 실행
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

파일을 bind mount로 사용하는 경우 기존 파일을 제자리에서 수정합니다. 호스트에서 원자 교체하면 컨테이너가 이전 파일을 계속 볼 수 있습니다. Caddy 컨테이너·80/443 매핑·인증서 볼륨은 유지합니다. 내부 API 리스너는 Docker DNS의 `aura-api` 별칭을 조회하므로 API 증감에 맞춰 설정을 다시 쓰거나 Caddy를 재시작할 필요가 없습니다. Next.js에는 `aura-web` 별칭을 사용합니다.

## 앱 시작과 배포

```sh
docker network inspect caddy
docker compose -f compose.yaml -f compose.lb.yaml config --quiet
docker compose -f compose.yaml -f compose.lb.yaml up -d --build
```

DB 보안 구성을 사용하면 `compose.database.yaml`도 함께 지정합니다.

```sh
docker compose -f compose.yaml -f compose.database.yaml -f compose.lb.yaml up -d --build
python3 ops/database.py status
```

API 수는 `.env`의 `AURA_API_REPLICAS`로 관리합니다. CD와 DB 운영 도구는 `compose.lb.yaml`이 있으면 함께 사용하여 다음 API 배포에서 공유 네트워크와 복제 수가 사라지지 않도록 합니다. CD는 웹의 네트워크·API 연결 주소·포트 변경도 반영합니다. 최초 연결 전환에는 웹 컨테이너 재생성이 필요할 수 있습니다. 정기 DB 비밀번호 회전은 앱 재시작 없이 수행합니다.

내부 Caddy는 TCP 연결 실패 시 다른 API로 연결할 수 있습니다. 연결 후 응답이 끊긴 요청의 재시도는 GET·HEAD·OPTIONS로 제한하여 처리된 POST 쓰기를 다시 보내지 않습니다. 진행 중인 응답에 별도의 짧은 제한 시간을 추가하지 않습니다.

## 검증

```sh
python3 ops/test_caddy.py
```

검증은 별도 임시 네트워크·컨테이너에서 실행합니다. 실제 공용 Caddy와 운영 앱을 변경하지 않습니다. 운영 Compose에 추가 프록시가 없고 웹의 직접 호스트 포트와 DB의 공용 네트워크 연결이 없는지 확인합니다. 테스트용 공용 Caddy 하나를 재사용해 `브라우저 → Caddy → 웹/BFF → 같은 Caddy → API` 경로, API 2개 분산과 3개·1개 증감, Caddy 비재시작, POST 처리 후 연결이 끊겨도 쓰기가 한 번만 발생하는지를 검사합니다. CI에서도 동일하게 실행합니다.
