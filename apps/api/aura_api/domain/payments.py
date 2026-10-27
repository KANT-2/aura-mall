"""Payment rules: the server's order total is the only amount, and approval is recorded once.

The browser opens the PG payment window with the order ID and amount this server issued,
then sends back the PG `paymentKey`. Nothing else the client says about money is trusted.
"""

import re
from datetime import timedelta
from typing import Literal

from aura_api.domain.errors import InvalidInput

PaymentStatus = Literal["READY", "IN_PROGRESS", "DONE", "FAILED", "CANCELED"]
# READY: issued, waiting for the PG window · IN_PROGRESS: approval claimed, result pending
# DONE: approved (approved_at set) · FAILED: definitely not approved. A new payment may follow.
# CANCELED: a READY attempt closed because its order was cancelled; never sent for approval.
PAYMENT_STATUSES: tuple[PaymentStatus, ...] = (
    "READY",
    "IN_PROGRESS",
    "DONE",
    "FAILED",
    "CANCELED",
)
# Statuses that hold the order: at most one per order (partial unique index).
OPEN_PAYMENT_STATUSES: tuple[PaymentStatus, ...] = ("READY", "IN_PROGRESS", "DONE")

# Refund attempts (0009): IN_PROGRESS result pending · DONE returned · FAILED rejected by the PG.
REFUND_STATUSES = ("IN_PROGRESS", "DONE", "FAILED")
# An IN_PROGRESS payment or refund older than this is "result unknown" and needs a person if the
# reconciliation job has not settled it (the job's default threshold).
UNRESOLVED_AFTER = timedelta(minutes=2)
REVIEW_REASON = re.compile(r"^[A-Z][A-Z0-9_]{0,99}$")  # codes such as PG_RESULT_MISMATCH

# Toss Payments limits (https://docs.tosspayments.com/reference).
PAYMENT_KEY = re.compile(r"^[A-Za-z0-9_-]{1,200}$")
PG_ORDER_ID = re.compile(r"^[A-Za-z0-9_-]{6,64}$")
MAX_AMOUNT = 100_000_000
ORDER_NAME_MAX = 100


def pg_order_id(payment_id_hex: str) -> str:
    """The order ID sent to the PG: one per payment attempt, never reused."""
    return "aura-" + payment_id_hex


def confirm_input(payment_key: object, order_id: object, amount: object) -> tuple[str, str, int]:
    if not isinstance(payment_key, str) or not PAYMENT_KEY.match(payment_key):
        raise InvalidInput("PAYMENT_KEY_INVALID", "결제 정보를 확인해 주세요.")
    if not isinstance(order_id, str) or not PG_ORDER_ID.match(order_id):
        raise InvalidInput("PAYMENT_ORDER_INVALID", "결제 정보를 확인해 주세요.")
    if type(amount) is not int or not 0 < amount <= MAX_AMOUNT:
        raise InvalidInput("PAYMENT_AMOUNT_INVALID", "결제 금액을 확인해 주세요.")
    return payment_key, order_id, amount


def ensure_amount(expected: int, claimed: int) -> None:
    """The client's amount only has to match; the stored order total is what is charged."""
    if claimed != expected:
        raise InvalidInput("PAYMENT_AMOUNT_MISMATCH", "결제 금액이 주문 금액과 달라요.")


def order_name(first_item: str, item_lines: int) -> str:
    rest = item_lines - 1
    name = first_item + (f" 외 {rest}건" if rest > 0 else "")
    return name[:ORDER_NAME_MAX]


def review_filter(
    status: object, reason: object, allowed: tuple[str, ...]
) -> tuple[str | None, str | None]:
    """Validate the admin list filters. Unknown values are an error, never silently ignored."""
    if status is not None and status not in allowed:
        raise InvalidInput("STATUS_INVALID", "상태 값을 확인해 주세요.")
    if reason is not None and (not isinstance(reason, str) or not REVIEW_REASON.match(reason)):
        raise InvalidInput("REVIEW_REASON_INVALID", "검토 사유 값을 확인해 주세요.")
    return status, reason
