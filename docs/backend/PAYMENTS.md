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

## 재고·쿠폰 (현재 구조와 필요한 변경)

주문 접수 시 재고 차감과 쿠폰 사용이 이미 끝납니다. 따라서 결제 실패나 장시간 미결제 주문은
재고와 쿠폰을 계속 점유합니다. 이번 PR은 이 동작을 바꾸지 않았습니다. 다음 주문 취소 PR에서 처리합니다.

- 미결제 `received` 주문을 일정 시간(예: 30분) 뒤 자동 취소하고, 주문 항목·Gift Set 구성으로 차감한
  재고를 되돌리고 쿠폰을 `AVAILABLE`로 복구합니다. 한 트랜잭션에서 `change_status(..., "cancelled")`와 함께 처리합니다.
- 자동 취소 전에 그 주문의 `IN_PROGRESS` 결제를 먼저 재확인합니다. 진행 중인 결제가 있는 주문은 취소하지 않습니다.
  늦게 승인되면 `ORDER_NOT_PAYABLE` 검토 대상이 되므로 이 순서가 필요합니다.
- 쿠폰 복구 시 회원 탈퇴 예약 삭제의 쿠폰 보존 조건(`used_order_id`, 주문 참조)과 맞춰야 합니다.

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

## 남은 결제 개발

1. BFF 경로(`/api/payments*`)와 결제창·성공/실패 페이지
2. 주문 취소와 미결제 주문 자동 취소, 재고·쿠폰 복구
3. 결제 취소·환불 API(토스 `POST /v1/payments/{paymentKey}/cancel`, 멱등키 사용)와 `review_reason` 건 처리
4. 재확인 작업 스케줄 등록과 관리자 화면의 결제 정보·검토 대상 표시
5. 웹훅 수신(가상계좌 입금 등)과 라이브 키 전환 승인 절차
