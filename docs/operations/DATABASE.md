# PostgreSQL 보안·복제·복구 운영

대상은 Docker Compose의 PostgreSQL 17입니다. `compose.database.yaml`을 추가하면 주 DB와 같은 서버에 스트리밍 복제본을 구성합니다. 기본값은 비동기 복제와 수동 승격이며, 아래 절차로 동기 복제와 자동 장애 전환을 활성화할 수 있습니다. **서버·디스크 장애를 견디는 HA는 별도 서버와 외부 백업이 필요합니다.** 자동 전환의 제어·차단 권한은 현재 호스트의 Docker daemon 하나에 있으며 원격 서버용 쿼럼 시스템으로 사용하지 않습니다.

| 항목           | 동작                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TLS            | 자체 서명한 내부 CA로 서버 인증서를 발급. 클라이언트는 CA와 호스트명을 `verify-full`로 검증. TCP 평문 접속 거부, TLS 1.2 이상                                                     |
| 인증서 갱신    | 서버 인증서·개인키 90일, 잔여 30일 이내 재발급. 매일 검사, 두 노드에 복사 후 설정 reload. 실제 제공 인증서의 일련번호와 신뢰 체인 확인. 실패 시 이전 인증서로 복구                |
| CA             | 10년 유효. CA 개인키는 호스트에만 저장하며 DB·API 컨테이너에는 제공하지 않음. 만료 1년 전부터 상태 검사 실패로 교체 필요 표시                                                     |
| 접속 비밀번호  | 애플리케이션 로그인 A/B를 번갈아 사용. 90일마다 앱과 복제 계정 비밀번호 회전. API 재시작 없이 모든 워커가 새 연결로 전환하고 진행 중인 이전 연결을 정리한 뒤 이전 로그인 비활성화 |
| 회전 중단 복구 | 전환 전 파일에 복구 기록을 남김. 실패 시 이전 URL·복제 비밀번호로 복원. 프로세스 중단 시 다음 `maintain`이 기록을 읽어 복구하거나 완료                                            |
| 복제           | 독립 볼륨, TLS 검증, 전용 REPLICATION 계정, 물리 슬롯. WAL 슬롯 보관 상한 1GB. 복제본이 따라오지 못하면 회전·정상 승격 중단                                                       |
| 백업           | 매일 논리 dump + 전역 역할, 14일 보관. 동일 호스트이므로 별도 매체로 복사해야 재해 복구 가능                                                                                      |

애플리케이션 계정은 `aura_runtime`의 테이블 DML·시퀀스 권한만 상속합니다. 관리자·DDL·REPLICATION 권한이 없습니다. 마이그레이션은 기존 관리자 계정으로 별도 실행합니다. `POSTGRES_USER` 관리자 자격증명은 자동 회전 대상이 아니며 호스트 비밀 관리 절차로 관리합니다. DB의 Unix 소켓은 Docker 접근 권한을 가진 운영자의 관리 채널입니다.

## 최초 전환

Python 3.12 이상, OpenSSL, Docker Compose v2, 해당 사용자의 Docker 접근 권한이 필요합니다. 저장소의 `.env`를 준비하고 기존 DB의 `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`를 유지합니다. 이 예제의 Compose 프로젝트 이름은 기존 배포와 같은 `aura`입니다. 다른 프로젝트라면 모든 운영 명령에 `--project <이름>`을 지정합니다.

전환은 DB/API 재기동을 포함하므로 점검 시간에 수행합니다. 기존 API는 새 URL 파일을 읽는 버전으로 빌드되어야 합니다.

```sh
# 기존 구성의 백업을 먼저 보관. 출력에 비밀번호를 넣지 않습니다.
umask 077
mkdir -m 700 -p .db-ops/backups
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > .db-ops/backups/before-tls.dump
docker compose exec -T db sh -c 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only' > .db-ops/backups/before-tls.globals.sql

docker compose -f compose.yaml -f compose.lb.yaml build api
python3 ops/database.py init
docker compose -f compose.yaml -f compose.lb.yaml stop api
docker compose -f compose.yaml -f compose.lb.yaml run --rm --no-deps api alembic upgrade head
python3 ops/database.py bootstrap
python3 ops/database.py maintain
python3 ops/database.py install-timer
```

`bootstrap`은 기존 주 DB 데이터 볼륨을 그대로 사용합니다. 역할·권한·복제 슬롯을 추가하고, 복제본을 base backup으로 생성한 뒤 API를 빌드합니다. 애플리케이션 테이블이나 계정 데이터를 생성·초기화하지 않습니다. 이미 적용된 스키마의 소유자와 현재 관리자의 기본 권한을 설정하므로 이후 이 관리자 역할로 만드는 테이블에도 런타임 권한이 적용됩니다. 다른 마이그레이션 역할을 도입하면 해당 역할의 기본 권한도 추가합니다.

운영 상태는 `.db-ops/state`, API URL은 `.db-ops/client/database-url`, 워커 확인 기록은 `.db-ops/runtime`에 저장합니다. API는 URL 파일을 0.5초 간격으로 확인합니다. 각 워커가 새 설정으로 SQLAlchemy/asyncpg와 psycopg의 TLS·접속 사용자·쓰기 가능 상태를 검증한 뒤 새 요청에 사용할 연결을 전환합니다. 진행 중인 요청은 기존 연결로 완료하고, 해당 연결이 모두 반환된 뒤 기존 연결 풀을 닫습니다. 비밀번호 회전에는 API 컨테이너 재생성·워커 재시작·처리 중인 세션 강제 종료가 없습니다.

운영 스크립트는 실행 중인 API 컨테이너 전체에서 워커의 PID·프로세스 시작 시각·설정 버전·이전 연결 정리 완료·최근 heartbeat를 확인합니다. 모든 워커가 새 설정을 반영한 후 이전 로그인을 비활성화하며, 기존 DB 세션이 남아 있으면 종료를 기다립니다. 기록이 없거나 일부 워커가 응답하지 않으면 회전을 완료하지 않습니다. API 워커를 실행하지 않는 별도 Python 명령으로 새 URL 접속만 확인해서 회전 성공으로 처리하지 않습니다.

새 설정이 잘못됐거나 검증에 실패하면 앱은 검증된 기존 연결을 유지합니다. 전환 확인이 실패하면 운영 스크립트가 이전 URL을 복원하고 워커들의 복원·연결 정리를 기다립니다. 요청을 강제로 끊지 않으므로 오래 걸리는 요청이 있으면 회전 제한 시간(기본 120초)을 조정하거나 해당 요청이 완료된 뒤 재실행합니다. 실패·중단 복구도 같은 확인 절차를 사용합니다. DB 트랜잭션이나 HTTP 요청을 회전 때문에 자동 재실행하지 않습니다.

전환 후 Compose를 직접 사용할 때는 DB 보안 구성과 Caddy 구성을 함께 지정합니다. 기본 Compose 실행에도 적용되도록 `.env`의 `COMPOSE_FILE`을 `compose.yaml:compose.database.yaml:compose.lb.yaml`로 설정합니다.

```sh
docker compose -f compose.yaml -f compose.database.yaml -f compose.lb.yaml ps
python3 ops/database.py status
python3 ops/database.py deploy-api
python3 ops/database.py migrate
```

CD는 관리 URL 파일이 존재하면 이 추가 구성을 선택하고 `deploy-api`로 배포합니다. 마이그레이션은 `migrate` 명령이 기존 관리자 자격증명과 검증된 TLS를 사용하여 일회용 컨테이너에서 실행합니다. DML 전용 런타임 계정에는 DDL 권한을 추가하지 않습니다. 관리자 URL은 명령 인자·로그·관리 URL 파일에 기록하지 않습니다. `compose.lb.yaml`이 있으면 CD와 운영 도구 모두 함께 사용해 기존 Caddy 공유 네트워크와 API 복제 수를 유지합니다. 먼저 [Caddy 배포 준비](../backend/DEPLOYMENT.md)를 완료합니다. 배포와 정기 유지보수는 같은 파일 잠금을 사용합니다. DB를 일반 `docker compose up`으로 재생성하지 않습니다. TLS 설정이나 승격 후 fence를 빼고 기동할 수 있습니다.

최초 전환이 실패하면 API를 멈춘 상태에서 원인을 해결하고 `bootstrap`을 재실행합니다. 전환 자체를 취소하려면 기존 `.env`를 유지한 채 기본 Compose로 DB/API를 재생성하면 됩니다. 단, **승격 후에는 이 방식으로 돌아가면 안 됩니다.** 승격 후 복구는 아래 절차를 따릅니다.

## 자동 실행과 확인

사용자 systemd 타이머가 매일 서버 현지 시각 03:00부터 30분 이내 실행됩니다. `Persistent=true`로 서버가 꺼져 있던 동안의 누락 실행을 보충합니다. 로그아웃 후에도 실행되도록 운영 계정에 lingering을 활성화합니다. 이 설정에 관리자 권한이 필요할 수 있습니다.

```sh
loginctl enable-linger "$USER"
systemctl --user list-timers aura-db-maintenance.timer
systemctl --user start aura-db-maintenance.service
systemctl --user status aura-db-maintenance.service
journalctl --user -u aura-db-maintenance.service --since today
```

실패는 systemd 실패 상태와 비밀값을 제외한 오류로 남습니다. 별도 알림 발송은 구성하지 않습니다. 운영 모니터링에서 이 서비스 실패·마지막 성공 시각과 디스크 용량을 감시합니다. `status`는 실제 API의 SQLAlchemy/asyncpg·psycopg TLS 접속과 모든 워커의 설정 반영, 주 DB 쓰기 가능 상태, 복제 스트리밍·WAL 재생, 인증서 잔여 기간을 검사합니다. `/health`는 프로세스 생존 여부, `/ready`는 실제 DB 접속과 쓰기 가능 여부를 구분하며 DB가 준비되지 않으면 `/ready`는 비밀값 없이 503을 반환합니다.

```sh
python3 ops/database.py renew          # 기한이 되면 인증서 갱신, 항상 제공 인증서 확인
python3 ops/database.py renew --force  # 갱신 리허설
python3 ops/database.py rotate         # 기한에 관계없이 앱·복제 비밀번호 회전
python3 ops/database.py backup
python3 ops/database.py maintain       # 중단된 회전 복구, 갱신, 백업, 기한 도래 회전, 상태 검사
```

CA는 갱신 때 교체하지 않습니다. CA 교체는 새 CA와 기존 CA를 함께 신뢰하도록 클라이언트에 먼저 배포하고, 새 CA로 서버 인증서를 발급·검증한 후 기존 CA를 제거하는 별도 작업입니다. 앱의 CA 설정 변경은 새 CA bundle 경로를 URL의 `sslrootcert`에 반영해 새 연결 설정으로 검증받습니다. `init`은 신뢰 CA가 달라지면 실패하며 자동 교체하지 않습니다. CA 키와 상태 디렉터리를 분실하면 인증서 갱신·회전 복구에 문제가 생기므로 암호화된 외부 보관본을 유지합니다.

## 장애 조치와 재합류

### 동기 복제와 자동 전환

관리 DB URL을 읽는 API를 배포하고 기존 TLS·복제·백업 상태를 먼저 검증합니다. 최초 활성화는 기존 복제본에 역할 상태 디렉터리를 추가하므로 해당 컨테이너를 재생성할 수 있습니다. 주 DB의 원본 볼륨과 API·웹 프로세스를 유지합니다.

```sh
python3 ops/database.py backup
python3 ops/database.py status
python3 ops/database.py ha-enable
python3 ops/database.py ha-install
systemctl --user status aura-db-failover.service
```

`ha-enable`은 두 노드의 실제 데이터 디렉터리를 기록하고 `synchronous_commit=remote_apply`, `synchronous_standby_names='FIRST 1 (aura_standby)'`를 검증합니다. 관리 노드의 재시작에도 같은 설정이 강제됩니다. 이후 정상 완료된 커밋은 복제본에 적용·영속화된 상태입니다. **복제본이 없거나 재생이 멈추면 쓰기 커밋은 기다립니다.** 자동으로 비동기 모드로 낮추지 않으며, 쿼리 제한 시간에 도달한 요청은 실패할 수 있습니다. 설정을 세션에서 임의로 낮추는 관리 SQL은 이 보장에 포함되지 않습니다.

제어 서비스는 약 0.5초마다 주 DB에 제한 시간이 있는 SQL을 보내고 연속 3회 실패하면 전환을 시작합니다. 백업·회전·배포 작업과 같은 호스트 파일 잠금을 사용하므로 동시에 역할·자격증명을 바꾸지 않습니다. 다른 운영 작업이 잠금을 보유하면 실패 누적을 초기화하고 기다립니다. DB가 살아 있고 복제본만 중단된 경우에는 기존 복제본을 다시 기동합니다.

비밀번호 회전의 연결 확인·정리 대기 중 주 DB가 중단되면 운영 명령은 대기를 중단하고 복구 기록을 남긴 채 잠금을 반환합니다. 자동 전환은 준비 단계 회전을 기존 자격증명으로 복원하고, 완료 단계 회전은 새 자격증명으로 마무리합니다. 복제 계정도 같은 기록과 일치시킨 뒤 새 복제본을 만들며, 앱 URL의 호스트와 회전 기록을 함께 갱신합니다. 일반 운영 명령은 제어 서비스의 짧은 상태 확인과 충돌하면 최대 30초 동안 잠금을 기다립니다.

복제 계정 비밀번호 변경 자체는 관리 세션에서만 로컬 WAL 영속화 후 반환하도록 처리합니다. 이 메타데이터 변경까지 복제 응답을 기다리면, 재시작한 복제본이 비밀번호 변경의 완료를 기다리는 동안 새 비밀번호로 접속하지 못하는 교착이 생길 수 있습니다. 재접속 파일을 먼저 준비하고 변경 뒤 실제 재접속·WAL 재생을 검증한 후에만 회전을 완료합니다. 앱 데이터의 `remote_apply` 설정은 유지합니다. 다른 운영 작업이 잠금을 보유한 중에도 기존 복제본의 재기동은 허용하며, 승격·역할 변경은 여전히 잠금과 journal로 직렬화합니다. 주 DB가 정상인 채 중단된 회전 기록도 제어 서비스가 복구합니다.

전환은 영속 journal 작성 → 기존 주 DB의 재기동 차단 파일 작성 → 기존 컨테이너 중지 및 실제 중지 확인 → 복제본 승격 → 주 DB 상태와 앱 URL 원자적 교체 → 이전 주 DB의 새 복제본 생성 순서입니다. 멈춘 프로세스뿐 아니라 Docker에서 pause된 노드도 해제 후 확실히 중지합니다. Docker가 중지를 확인하지 못하면 승격하지 않습니다. 제어 프로세스가 중단되면 재시작한 서비스가 journal을 읽어 같은 전환을 이어갑니다. `ha-check`로 수동 복구도 할 수 있습니다.

앱은 URL 변경을 검증하고 새 요청을 새 연결 풀로 전환합니다. API·웹 재시작은 필요하지 않습니다. 연결이 끊긴 `/api/v1/catalog`와 `/api/v1/catalog/products/*`의 GET만 최대 8초 동안 전체 조회를 새 요청 세션으로 재시도합니다. 기존 BFF의 10초 제한 안에서 전환을 기다리는 방식입니다. 장시간 장애나 후보 노드의 장애까지 정상 응답으로 바꾸지는 않습니다. 기존 연결 실패와 재연결 시 DNS·소켓 실패는 비밀값 없는 `503 DATABASE_UNAVAILABLE`로 처리합니다. 주문·결제·POST·다른 GET은 자동 재실행하지 않습니다. 장애 순간 커밋 응답을 받지 못한 쓰기는 결과가 불확실할 수 있으므로 업무의 멱등성 키·상태 조회 절차를 사용합니다.

재합류는 이전 데이터 디렉터리를 삭제하거나 덮어쓰지 않고 해당 볼륨의 `ha-<임의 식별자>` 디렉터리에 새 base backup을 만듭니다. 동기 복제본이 다시 붙을 때까지 새 주 DB의 쓰기 커밋도 기다립니다. 복구 후 반대 방향의 다음 장애에도 같은 절차가 동작합니다. 보존한 이전 데이터는 자동 삭제하지 않으므로 디스크 여유를 감시하고, 외부 백업과 복구를 확인한 뒤 별도로 정리합니다. 재합류 실패 시 차단 파일과 journal을 유지하고 다시 시도합니다.

```sh
python3 ops/database.py status
python3 ops/database.py ha-check
journalctl --user -u aura-db-failover.service --since today
# 의도적인 DB 정비 전에 자동 전환 서비스를 먼저 중지합니다.
systemctl --user stop aura-db-failover.service
# 정비·복제 검증 후 다시 실행합니다.
systemctl --user start aura-db-failover.service
```

자동 전환 모드에서는 `promote`도 같은 차단·journal·재합류 절차를 수행합니다. `rejoin`은 진행 중인 자동 전환을 재개합니다. 아래의 기존 단방향 수동 절차는 자동 전환을 활성화하지 않은 구성에 적용합니다.

### 기존 비동기 구성의 수동 전환

비동기 복제입니다. 정상 승격은 API를 멈춘 뒤 주 DB의 현재 WAL까지 복제본이 재생했는지 확인합니다. 주 DB를 중지하고 영속 fence 파일을 만든 뒤 복제본을 승격하며 API URL을 전환합니다. 이 fence는 추가 Compose 구성을 사용하는 한 이후 재기동에도 적용됩니다.

```sh
python3 ops/database.py backup
python3 ops/database.py promote
python3 ops/database.py rejoin
python3 ops/database.py maintain
```

승격 이후 writer는 `db-standby`, 복제본은 `db`입니다. `rejoin`은 이전 주 DB의 원본 데이터 파일을 보존하고, 같은 볼륨의 `rejoined/` 디렉터리에 승격된 DB의 새 base backup을 받습니다. 원본과 새 복제본을 함께 저장할 디스크 여유가 필요합니다. base backup은 빠른 체크포인트를 요청하므로 일시적으로 디스크 부하가 늘 수 있습니다. 기본 대기 시간은 10분이며 큰 DB는 상태 검사와 명령의 제한 시간을 늘립니다. 이전 서버는 이 디렉터리의 `standby.signal`이 없으면 기동을 거부합니다. 재합류 후 데이터와 비밀번호 회전·백업을 다시 확인합니다. 이전 데이터 정리는 복구 검증과 외부 백업을 확인한 다음 별도 작업으로 수행합니다.

주 DB에 접속할 수 없으면 `promote --allow-data-loss`로 WAL 확인을 생략할 수 있습니다. 이 경우 복제 지연만큼 데이터가 손실될 수 있습니다. Docker에서 기존 주 DB가 중지됐음을 확인할 수 없으면 승격하지 않습니다. 승격 중 중단된 경우 `promote` 재실행으로 완료할 수 있습니다. 재합류 전에 `maintain`은 TLS 갱신·백업을 수행하지만 복제 누락을 실패로 보고합니다.

이 스크립트는 최초 `db → db-standby` 승격과 이전 주 DB의 재합류를 지원합니다. 재합류 후 반대 방향으로의 추가 승격·원래 이름으로의 failback, 유효하지 않은 복제 슬롯이나 훼손된 복제본의 재생성은 별도 점검 작업입니다. fence를 삭제하거나 이전 writer를 기본 Compose로 기동하지 않습니다. 향후 별도 서버에서는 fencing·쿼럼을 갖춘 장애 조치 관리자를 도입합니다.

## 백업 복원과 비밀값

백업의 `.globals.sql`에는 역할의 비밀번호 검증값이 있고, dump에는 고객 데이터가 포함될 수 있습니다. `.db-ops/` 전체는 Git에서 제외하며 호스트 소유자 전용으로 관리합니다. CA 개인키·서버 개인키·접속 URL·복제 비밀번호·복구 기록·백업은 저장소에 올리지 않습니다. 컨테이너에는 필요한 하위 경로만 제공하며 CA 개인키와 백업을 마운트하지 않습니다.

복원은 운영 DB와 분리된 PostgreSQL 17에서 먼저 검증합니다. `pg_dump` 백업과 동일 시각의 `.globals.sql`, 기존 `.env`와 운영 상태의 암호화 보관본을 준비합니다. 빈 DB 서버에 역할을 복원할 때 이미 있는 관리자 역할은 충돌 여부를 검토합니다. 이후 생성한 빈 대상 DB에 `pg_restore --exit-on-error --dbname=<대상 DB> <백업.dump>`로 복원하고, 행 수·권한·로그인·주요 업무 흐름을 확인합니다. 기존 운영 데이터에 직접 덮어쓰지 않습니다.

저장소에는 재현 가능한 검증 스크립트만 포함합니다.

```sh
python3 ops/test_database.py
```

이 명령은 새 임시 디렉터리와 임의 Compose 프로젝트·볼륨을 만들고 실제 PostgreSQL로 TLS 거부 조건, 인증서·개인키 갱신, 앱·복제 계정 회전, 실패·중단 복구, 논리 복원, 복제본 재시작, 승격과 fence, 재합류를 검사한 뒤 해당 테스트 볼륨만 정리합니다. 운영 `.env`·볼륨·개인정보를 사용하지 않습니다. CI의 `database-operations` 작업에서도 동일하게 실행합니다.

추가 자동 전환 검증은 실제 카탈로그 HTTP 요청이 PostgreSQL 테이블 잠금을 기다리는 중 주 DB를 종료하고, 같은 요청이 새 연결로 200에 완료되는지 확인합니다. 미완료 POST 트랜잭션은 503으로 실패하며 새 DB에 부분 데이터가 없고 자동 재실행되지 않는지 검사합니다. 성공 응답을 받은 동기 커밋의 보존, 반대 방향의 두 번째 장애, pause된 DB의 차단, 중지 확인 실패 시 승격 거부, 제어 프로세스 교체 후 journal 복구, 모든 API 워커 식별자 유지와 이후 비밀번호 회전·TLS 갱신도 검증합니다.

비밀번호 회전의 인수 기준은 **요청 처리 도중 회전해도 해당 요청이 200으로 완료되고 DB 변경이 정확히 한 번 커밋되는 것**입니다. 검증용 앱의 실제 두 워커에서 SQLAlchemy와 psycopg 트랜잭션을 유지한 HTTP 요청을 시작하고, 요청이 진행 중인 상태에서 실제 앱·복제 비밀번호를 회전합니다. 새 요청이 새 계정으로 처리되는 동안 이전 요청의 두 DB 연결이 유지되고 이전 로그인도 활성 상태인지 확인합니다. 기존 요청을 완료시킨 뒤 양쪽 쓰기가 각각 정확히 1건인지, 이전 로그인이 비활성화됐는지, 컨테이너와 워커의 식별자가 그대로인지 검사합니다.

이때 첫 요청은 실제 DB 행을 UPDATE하여 잠금을 보유합니다. 두 번째 HTTP 쓰기 요청이 같은 행에 UPDATE를 보내 잠금 대기 중인 것을 `pg_stat_activity.wait_event_type='Lock'`와 `pg_blocking_pids()`로 확인한 뒤 회전합니다. 새 계정으로 새 요청이 처리되는 동안에도 기존 요청의 트랜잭션과 행 잠금·대기를 유지합니다. 첫 요청을 완료해 잠금을 해제한 뒤 대기 요청도 200으로 완료되고 각 기록이 1건씩이며 행 값의 증가가 정확히 2회인지 확인합니다. 앱의 잠금·쿼리 제한 시간을 검증 때문에 늘리지 않습니다. 인증 저장소의 기존 3초 잠금·5초 쿼리 제한은 유지하며, 제한 시간 초과나 교착 상태로 인한 DB 자체의 실패는 회전으로 요청이 끊기는 상황과 구분합니다. 검증용 HTTP 경로는 임시 테스트 이미지에만 포함됩니다.

구현 기준: [PostgreSQL TLS 설정](https://www.postgresql.org/docs/17/ssl-tcp.html), [클라이언트 인증서 검증](https://www.postgresql.org/docs/17/libpq-ssl.html), [스트리밍 복제](https://www.postgresql.org/docs/17/warm-standby.html).
