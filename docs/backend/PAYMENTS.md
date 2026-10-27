# 결제 1차: 결제 시도·PG 승인·주문 결제 완료 (마이그레이션 0007)

회원 주문을 토스페이먼츠로 결제하는 서버 기반입니다. 주문은 PG 승인과 서버 검증을 모두 통과해야만
`paid`가 됩니다. 이번 단계에는 결제 취소·환불, 프런트 결제창, 실제 운영 결제가 없습니다.
설정에서 라이브 키를 거부하므로 테스트 키로만 동작합니다.

## 흐름

```text
브라우저            BFF·FastAPI                         토스페이먼츠
   │ POST /payments {orderId}
   │ ──────────────► 결제 시도 발급(READY), 금액 = orders.total
   │ ◄────────────── { pgOrderId, amount, orderName }
   │ 결제창 (pgOrderId, amount) ──────────────────────────► 카드 인증
   │ ◄──────────────────────────── successUrl ?paymentKey&orderId&amount
   │ POST /payments/confirm {paymentKey, orderId, amount}
   │ ──────────────► ① 짧은 트랜잭션: 소유자·주문 상태·금액 확인 후 IN_PROGRESS
   │                 ② 트랜잭션 밖: POST /v1/payments/confirm ───► 승인
   │                    (Idempotency-Key = 결제 시도 ID)       ◄─── 결과
   │                 ③ 짧은 트랜잭션: DONE + 주문 paid + 이력  또는 FAILED
   │ ◄────────────── 200 DONE·FAILED / 202 IN_PROGRESS
```

## API (회원 JWT, CSRF 적용)

| 요청                         | 성공                                                 | 주요 오류                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /payments` `{orderId}` | 201 새 결제 대기, 200 기존 결제 대기 재사용          | 404 `ORDER_NOT_FOUND`, 409 `ORDER_ALREADY_PAID`·`PAYMENT_IN_PROGRESS`·`ORDER_NOT_PAYABLE`                                                                  |
| `POST /payments/confirm`     | 200 `DONE`·`FAILED`, 202 `IN_PROGRESS`(결과 확인 중) | 400 `PAYMENT_AMOUNT_MISMATCH` 등 입력 오류, 404 `PAYMENT_NOT_FOUND`, 409 `PAYMENT_CLOSED`·`PAYMENT_IN_PROGRESS`·`PAYMENT_KEY_CONFLICT`·`ORDER_NOT_PAYABLE` |
| `GET /payments/{id}`         | 200 본인 결제                                        | 404                                                                                                                                                        |

PG가 설정되지 않았으면 모든 결제 요청이 503입니다. 다른 회원의 주문·결제는 존재 여부를 숨기고 404,
관리자 토큰은 401입니다. 응답: `id`, `orderId`, `pgOrderId`, `orderName`, `amount`, `status`,
`method`, `approved`, `failureCode`, `failureMessage`.

## 정합성 규칙

| 위험                 | 대응                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| 금액 위변조          | 결제 금액은 발급 시 복사한 `orders.total`. 클라이언트 금액은 다르면 400이며 PG에는 서버 금액만 전송      |
| 다른 회원 주문       | 주문·결제 조회에 소유자 조건, 활성 회원 잠금                                                             |
| 이중 결제            | 주문당 `READY`·`IN_PROGRESS`·`DONE` 1건(부분 UNIQUE), paymentKey UNIQUE, 결제 완료 주문은 재발급 409     |
| 동시 승인            | 주문 → 결제 행 잠금 순서로 한 요청만 `IN_PROGRESS` 획득. 같은 키 동시 요청은 PG 멱등키로 1회만 승인      |
| PG 호출 중 DB 잠금   | 잠금은 ①·③의 짧은 트랜잭션에서만. PG 호출 중에는 트랜잭션 없음                                           |
| 승인 실패            | `FAILED` + PG 코드·메시지 기록. 주문은 `received` 유지, 새 결제 시도 가능                                |
| 타임아웃·PG 5xx      | 결과 미확정 → `IN_PROGRESS` 유지, 202. 같은 확인 요청 재전송 또는 재확인 작업이 같은 멱등키로 다시 요청  |
| 승인 후 DB 기록 실패 | 롤백되어 `IN_PROGRESS` + paymentKey 유지. 재확인 시 PG가 첫 승인 결과를 돌려주고 한 번만 기록            |
| 승인됐지만 주문 불가 | 주문이 그사이 `received`를 벗어나면 `DONE` + `review_reason=ORDER_NOT_PAYABLE`, 주문은 그대로(환불 필요) |
| PG 결과 불일치       | paymentKey·주문번호·금액이 다르면 `DONE` + `review_reason=PG_RESULT_MISMATCH`, 주문 미변경               |
| 미결제 주문 제작     | `received → preparing` 전이 제거, `paid`는 결제 서비스만 설정                                            |

토스 오류 중 `ALREADY_PROCESSING_REQUEST`·`IDEMPOTENT_REQUEST_PROCESSING`·`PROVIDER_ERROR`·5xx
계열은 실패로 확정하지 않습니다. `ALREADY_PROCESSED_PAYMENT`는 paymentKey로 결제를 조회합니다.
그 밖의 4xx는 승인되지 않은 것으로 기록합니다. 조회 상태 `CANCELED`·`PARTIAL_CANCELED`는 실패 +
`CANCELED_AT_PG` 검토 사유입니다. 가상계좌 입금 대기(`WAITING_FOR_DEPOSIT`)는 확인 중으로 남습니다.

## 결과 재확인 작업

```sh
uv run --directory apps/api python -m aura_api.infra.reconcile_payments --older-than 120
```

`IN_PROGRESS`로 2분 이상 남은 결제를 같은 멱등키로 다시 승인 요청해 결과를 기록합니다. 토스 멱등키는
15일간 유효하고, 결제 인증 후 10분 안에 승인하지 않으면 PG에서 만료되어 실패로 확정됩니다. 확인 중인
건이 남으면 종료 코드 1입니다. 실행 주기(예: 5분)는 배포 환경에 등록해야 합니다.

## 재고·쿠폰과 주문 취소

주문 접수 시 재고 차감과 쿠폰 사용이 끝나므로, 결제하지 않은 주문은 취소될 때까지 재고와 쿠폰을
점유합니다. 회원 취소와 미결제 만료 작업이 이를 되돌립니다(마이그레이션 0008,
[주문 취소 문서](ORDER_CANCELLATION.md)). 취소된 주문의 `READY` 결제 시도는 `CANCELED`가 되어 이후
승인 요청은 409 `PAYMENT_CLOSED`입니다. `IN_PROGRESS` 결제가 있는 주문은 취소하지 않습니다.

## 보안

- 시크릿 키는 서버 환경 변수로만 받고 응답·로그·오류·`repr`에 넣지 않습니다. 저장소에 넣지 않습니다.
- 카드 정보는 서버를 거치지 않으며 저장하지 않습니다. PG 실패 메시지는 500자로 자르고 저장합니다.
- PG 주소는 HTTPS만 허용하며 TLS 인증서 검증은 Python 기본값을 사용합니다.
- 테스트용 Fake PG는 `tests/fixtures`에만 있으며 어떤 설정으로도 운영 앱에서 선택할 수 없습니다.

## 실제 토스 테스트 연동에 필요한 설정

| 설정                           | 값                                                                    |
| ------------------------------ | --------------------------------------------------------------------- |
| `AURA_PAYMENT_PROVIDER`        | `toss`                                                                |
| `AURA_TOSS_SECRET_KEY`         | 개발자센터 테스트 시크릿 키(`test_sk_…` 또는 결제위젯 `test_gsk_…`)   |
| `AURA_PAYMENT_TIMEOUT_SECONDS` | 기본 30, 최대 60                                                      |
| 웹                             | 테스트 클라이언트 키, 결제창 SDK, successUrl·failUrl 페이지, BFF 경로 |

## 토스 테스트 결제 흐름 로컬 검증

실제 토스 테스트 환경(실제 청구 없음)으로 승인까지 확인하는 최소 화면이 있습니다. 개발·검증용이며
`/payments/test`는 색인에서 제외됩니다.

| 경로                | 역할                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `/payments/test`    | 로그인한 회원이 테스트 주문을 만들고 결제를 발급해 토스 결제위젯으로 결제   |
| `/payments/success` | 토스가 돌려보낸 `paymentKey`·`orderId`·`amount`를 서버 승인 API로 전달·표시 |
| `/payments/fail`    | 토스가 돌려보낸 오류 코드·메시지 표시. 결제 완료로 기록하지 않음            |

BFF는 `POST /api/payments`, `POST /api/payments/confirm`, `GET /api/payments/{id}`를 FastAPI로 전달하며
본문은 허용한 필드만 보냅니다. 결제위젯 SDK는 `https://js.tosspayments.com/v2/standard`입니다.

로컬 실행에 필요한 설정(값은 저장소·로그·커밋에 넣지 않습니다):

- FastAPI: `AURA_PAYMENT_PROVIDER=toss`, `AURA_TOSS_SECRET_KEY`(테스트 시크릿 키), DB·JWT 설정,
  `AURA_BFF_SHARED_KEY`, `AURA_CSRF_ALLOWED_ORIGINS`
- Next: `NEXT_PUBLIC_TOSS_CLIENT_KEY`(테스트 클라이언트 키, `.env.local`), `API_URL`, `API_PREFIX=/api/v1`,
  `API_AUTH_MODE=jwt`, `API_BFF_SHARED_KEY`(FastAPI와 같은 값), `APP_ORIGIN`
- `API_BFF_SHARED_KEY`가 없으면 FastAPI가 BFF 요청을 403으로 거절합니다.
- 결제위젯 테스트 환경은 결제수단 선택 후 휴대폰 번호와 테스트 비밀번호(위젯 화면에 표시)를 안내합니다.

2026-10-27 일회용 DB와 로컬 서버로 실제 토스 테스트 API를 호출해 확인한 결과입니다.

| 확인 항목                        | 결과                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| 위젯 결제 → 성공 URL → 서버 승인 | 결제 `DONE`(계좌이체, 31,000원), 주문 `paid`, 상태 이력 `system` 기록     |
| 같은 확인 요청 재전송            | 200 `DONE`, 두 번째 승인 없음                                             |
| 금액 100원·31,001원으로 확인     | 400 `PAYMENT_AMOUNT_MISMATCH`                                             |
| 결제 완료 주문에 다른 paymentKey | 409 `ORDER_ALREADY_PAID`                                                  |
| 미결제 주문에 변조 금액          | 400, PG 호출 없음                                                         |
| 위조 paymentKey + 올바른 금액    | 토스가 거절(`NOT_FOUND_PAYMENT_SESSION`) → 결제 `FAILED`, 주문 `received` |
| 존재하지 않는 결제 조회·승인     | `NOT_FOUND_PAYMENT`·`NOT_FOUND_PAYMENT_SESSION`으로 매핑                  |
| 잘못된 시크릿 키                 | 401 `UNAUTHORIZED_KEY`(결제 실패가 아닌 인증 오류)                        |
| 승인된 결제의 토스 조회          | 상태·금액·주문번호·paymentKey가 우리 기록과 일치                          |

이 결과는 토스 **테스트** 환경 검증입니다. 운영 키·실결제는 검증하지 않았습니다. 타임아웃·승인 후 DB
오류 복구와 동시 승인은 PG를 흉내 낸 테스트(Fake PG)로만 검증했고, 실제 토스에서는 재현하지 않았습니다.

## 남은 결제 개발

1. ~~BFF 경로와 결제창·성공/실패 페이지~~ (최소 테스트 화면 구현. 상품·주문 화면과 연결하는 정식 결제 화면은 남음)
2. ~~주문 취소와 미결제 주문 자동 취소, 재고·쿠폰 복구~~ (0008에서 구현, 만료 시간 정책과 스케줄 등록은 남음)
3. 결제 취소·환불 API(토스 `POST /v1/payments/{paymentKey}/cancel`, 멱등키 사용)와 `review_reason` 건 처리
4. 재확인 작업 스케줄 등록과 관리자 화면의 결제 정보·검토 대상 표시
5. 웹훅 수신(가상계좌 입금 등)과 라이브 키 전환 승인 절차
