# 주문 상태 모델 (마이그레이션 0006)

주문에 상태와 상태 변경 이력을 추가했습니다. 기존 주문 접수 흐름은 그대로이며, 지금 만들어지는
모든 주문은 결제 없는 `received`(접수)입니다. 상태를 바꾸는 HTTP API·결제·취소·재고 복구는
후속 PR에서 아래 규칙과 저장 함수를 재사용해 추가합니다.

## 상태

| 상태        | 의미                 | 진입 시점 (예정 포함)            |
| ----------- | -------------------- | -------------------------------- |
| `received`  | 주문 접수, 결제 없음 | 주문 생성 시 (현재 모든 주문)    |
| `paid`      | 결제 완료            | 결제 승인 PR에서 사용            |
| `preparing` | 제작·출고 준비       | 관리자 처리                      |
| `shipped`   | 배송 중              | 관리자 처리                      |
| `delivered` | 배송 완료            | 관리자 처리. 이후 변경 없음      |
| `cancelled` | 취소                 | 취소 PR에서 사용. 이후 변경 없음 |

환불은 주문 상태가 아니라 결제 기록의 상태로 다룰 예정이므로 목록에 넣지 않았습니다.

## 전이 규칙

```text
received ──► paid ──► preparing ──► shipped ──► delivered
   │          │           │
   │          ▼           ▼
   └──────► cancelled ◄───┘
```

결제 1차(마이그레이션 0007)부터 결제되지 않은 주문은 `preparing`으로 갈 수 없습니다. `paid`는
결제 서비스가 PG 승인과 서버 금액 검증을 마친 뒤에만 설정하며(`payment_verified=True`), 그 밖의
호출은 409 `ORDER_PAYMENT_REQUIRED`입니다. 결제 흐름은 [결제 문서](PAYMENTS.md)를 봅니다.

| 현재        | 바꿀 수 있는 상태                  |
| ----------- | ---------------------------------- |
| `received`  | `paid`(결제 서비스만), `cancelled` |
| `paid`      | `preparing`, `cancelled`           |
| `preparing` | `shipped`, `cancelled`             |
| `shipped`   | `delivered`                        |
| `delivered` | 없음                               |
| `cancelled` | 없음                               |

규칙은 `aura_api/domain/ordering.py`의 `ORDER_TRANSITIONS` 한 곳에 있습니다. 목록에 없는 상태는
400 `ORDER_STATUS_INVALID`, 허용되지 않은 전이는 409 `ORDER_STATUS_CONFLICT`입니다. 누가 어떤
전이를 할 수 있는지(회원은 접수 상태 취소만 등)는 후속 API PR에서 정합니다.

**팀 확인 필요:** `preparing`(특히 맞춤 조향 제작 중) 주문을 취소할 수 있는지.

## 저장과 동시성

- `orders.status`: 기본값 `received`, CHECK로 6개 상태만 허용합니다.
- `order_status_history`: 상태가 바뀔 때마다 한 행을 추가합니다. 첫 행은 `from_status` NULL입니다.
  변경 주체(`member`·`admin`·`system`)와 ID, 200자 이하 사유, 시각을 남깁니다. 수정·삭제하지 않습니다.
- 주문 생성 시 같은 트랜잭션에서 첫 이력(`member`, 주문한 회원)을 기록합니다.
- `infra/repositories/orders.py`의 `change_status()`가 주문 행을 `FOR UPDATE`로 잠근 뒤 전이를
  검사하고 상태·이력을 함께 바꿉니다. `owner_id`를 주면 그 회원의 주문만 찾습니다. 호출한
  트랜잭션에서 커밋하므로 취소 PR의 재고·쿠폰 복구가 같은 트랜잭션에 들어갈 수 있습니다.
- 같은 주문을 동시에 바꾸면 한 요청만 반영되고, 나머지는 잠금이 풀린 뒤 새 상태 기준으로 다시
  검사되어 409가 됩니다. 같은 세션이 주문을 미리 읽어 두었어도 잠금 후 DB 값을 다시 읽어 검사합니다.

## 기존 데이터 이전

0006은 기존 주문 행을 바꾸지 않고 `status`를 기본값 `received`로 채웁니다. 기존 주문마다
`system` 이력 한 행을 원래 주문 시각(`created_at`)으로 추가하고 사유를 `migration 0006`으로
남깁니다. 되돌리기(`downgrade 0005`)는 상태 컬럼과 이력 테이블을 지우므로 그 사이의 상태 변경은
사라집니다.

## API 반영 (계약 1.1.0)

| 응답                                | 추가 필드                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| 회원 `GET·POST /orders`             | `status`                                                                              |
| 관리자 주문 목록·대시보드 최근 주문 | `status`                                                                              |
| 관리자 주문 상세                    | `status`, `statusHistory[]`(`fromStatus`, `status`, `actorType`, `reason`, `changed`) |

회원 응답에는 이력과 변경자 ID를 넣지 않습니다. 관리자 이력에도 변경자 ID는 넣지 않습니다.
BFF 어댑터는 아직 이 필드를 브라우저에 전달하지 않으며, 웹 표시와 함께 연결해야 합니다.

## 후속 작업에서 필요한 것

- 주문 취소: 0008에서 구현했습니다. [주문 취소 문서](ORDER_CANCELLATION.md)를 봅니다.
- 결제 완료 주문 취소: 0009에서 PG 전액 환불 뒤 `paid → cancelled`로 구현했습니다. [환불 문서](REFUNDS.md)를 봅니다.
- 관리자 상태 변경 API: `PATCH /admin/orders/{id}` + 기존 `admin_audit_logs`와의 기록 관계.
- 대시보드 매출·주문 수에서 `cancelled` 제외 여부.
- BFF·웹: `Order.status`, `AdminOrderSummary.status`, `AdminOrder.statusHistory` 타입·어댑터·Mock·화면.
