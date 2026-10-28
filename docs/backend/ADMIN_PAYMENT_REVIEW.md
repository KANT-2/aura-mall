# 관리자 결제·환불 검토 조회 API (계약 1.5.0)

결제·환불 과정에서 사람이 확인해야 하는 건을 관리자가 찾도록 하는 **읽기 전용** API입니다. DB 변경은
없고, 기존 `payments.review_reason`·`refunds.review_reason`·상태 구조를 그대로 씁니다. PG를 호출하지
않으며 어떤 데이터도 바꾸지 않습니다. 관리자 JWT(`/admin/**`)만 접근할 수 있고 회원 토큰·비로그인은 거절됩니다.

| 경로                         | 목록에 나오는 조건                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /admin/payments/review` | `review_reason`이 있음 **또는** `IN_PROGRESS`로 2분 넘게 남음(PG 결과 불명)                |
| `GET /admin/refunds/review`  | `review_reason`이 있음 **또는** PG가 거절(`FAILED`) **또는** `IN_PROGRESS`로 2분 넘게 남음 |

2분은 `reconcile_payments`·`reconcile_refunds`의 기본 기준과 같습니다. 재확인 작업이 해결하면 목록에서
사라집니다. 정상 결제(`DONE`)·정상 환불·진행 직후 건·일반 결제 실패는 나오지 않습니다.

## 쿼리

| 이름     | 설명                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `status` | 결제: `READY`·`IN_PROGRESS`·`DONE`·`FAILED`·`CANCELED`. 환불: `IN_PROGRESS`·`DONE`·`FAILED`. 다른 값은 400 `STATUS_INVALID` |
| `reason` | 검토 사유 정확히 일치(대문자·숫자·`_`, 100자 이하). 형식이 다르면 400 `REVIEW_REASON_INVALID`                               |
| `page`   | 1부터, 페이지당 20건. 잘못된 값은 다른 관리자 목록처럼 1쪽으로 처리                                                         |

응답은 `AdminPage`(`items`, `total`, `page`, `pageSize`)이며 최근 변경(`updated`)순입니다.

## 응답 항목

- **결제**: `id`, `orderId`, `pgOrderId`, `orderStatus`, `customer`(`id`·`name`·`email`, 탈퇴로 없으면 null),
  `status`, `amount`, `method`, `reviewReason`, `unresolved`, `failureCode`, `failureMessage`, `approved`,
  `created`, `updated`
- **환불**: `id`, `paymentId`, `orderId`, `orderStatus`, `customer`, `status`, `amount`, `reason`, `actorType`,
  `reviewReason`, `unresolved`, `failureCode`, `failureMessage`, `requested`, `refunded`, `updated`

`unresolved`는 PG 결과를 2분 넘게 확인하지 못했다는 뜻입니다. 고객 정보는 기존 관리자 주문 목록과 같은 범위입니다.

## 노출하지 않는 것

PG `paymentKey`·환불 `transactionKey`·토스 시크릿 키·인증 정보는 응답 모델에 없습니다(테스트로 확인).
`failureMessage`는 PG가 준 확정 거절 사유(500자 이하)입니다.

## 검토 사유 값

| 값                       | 출처                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `PG_RESULT_MISMATCH`     | 승인됐지만 PG 응답의 키·주문번호·금액이 기록과 다름                    |
| `ORDER_NOT_PAYABLE`      | 승인됐지만 주문이 이미 `received`가 아님(돈은 받았고 주문은 결제 불가) |
| `CANCELED_AT_PG`         | 승인 뒤 PG에서 취소된 결제                                             |
| `REFUND_AMOUNT_MISMATCH` | 환불 취소 금액이 전액과 다름(환불 `IN_PROGRESS` 유지)                  |
| `ORDER_NOT_PAID`         | 환불은 됐지만 주문이 `paid`가 아니어서 자동 취소하지 못함              |

처리(PG 대시보드 대조, 수동 환불·취소)는 이번 범위가 아니며 조회만 제공합니다.

## 남은 것

BFF `/api/admin/payments/review`·`/api/admin/refunds/review` 경로와 관리자 화면, 검토 건 처리 이력·메모.
