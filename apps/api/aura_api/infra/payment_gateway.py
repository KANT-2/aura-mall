"""PG gateway interface and the Toss Payments client (https://docs.tosspayments.com/reference).

The gateway only reports what the PG said. It never decides order state, and it never sees
or returns card data: the browser talks to the PG window directly.
"""

import base64
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from urllib.parse import quote

from anyio.to_thread import run_sync

Outcome = Literal["approved", "failed", "pending"]
MESSAGE_MAX = 500


@dataclass(frozen=True)
class GatewayResult:
    outcome: Outcome
    payment_key: str | None = None
    order_id: str | None = None
    amount: int | None = None
    method: str | None = None
    approved_at: datetime | None = None
    code: str | None = None
    message: str | None = None
    canceled: bool = False  # approved earlier, then canceled at the PG


@dataclass(frozen=True)
class RefundResult:
    outcome: Literal["refunded", "failed", "pending"]
    transaction_key: str | None = None
    amount: int | None = None  # what the PG says was returned in total
    refunded_at: datetime | None = None
    code: str | None = None
    message: str | None = None


class GatewayUnavailable(Exception):
    """No definite answer (timeout, network, PG 5xx, request still processing). Retry later."""


class PaymentGateway(Protocol):
    provider: str

    async def confirm(
        self, *, payment_key: str, order_id: str, amount: int, idempotency_key: str
    ) -> GatewayResult: ...

    async def lookup(self, *, payment_key: str) -> GatewayResult: ...

    async def cancel(
        self, *, payment_key: str, amount: int, reason: str, idempotency_key: str
    ) -> RefundResult: ...


# Toss error codes that do not prove the payment failed: retry with the same idempotency key.
TOSS_RETRY_CODES = frozenset(
    {
        "ALREADY_PROCESSING_REQUEST",
        "IDEMPOTENT_REQUEST_PROCESSING",
        "PROVIDER_ERROR",
        "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING",
        "FAILED_INTERNAL_SYSTEM_PROCESSING",
        "FAILED_CARD_COMPANY_RESPONSE",
        "UNKNOWN_PAYMENT_ERROR",
    }
)
TOSS_PENDING = frozenset({"READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT"})
TOSS_FAILED = frozenset({"ABORTED", "EXPIRED"})
TOSS_CANCELED = frozenset({"CANCELED", "PARTIAL_CANCELED"})
# Only explicit business rejections close an attempt. Authentication, lookup, rate-limit
# and unfamiliar errors say nothing about whether a previous request moved money.
TOSS_CONFIRM_REJECTIONS = frozenset(
    {
        "REJECT_CARD_PAYMENT",
        "REJECT_ACCOUNT_PAYMENT",
        "REJECT_CARD_COMPANY",
        "INVALID_CARD_NUMBER",
        "EXCEED_MAX_AUTH_COUNT",
    }
)
TOSS_CANCEL_REJECTIONS = frozenset({"NOT_CANCELABLE_PAYMENT", "INVALID_REFUND_ACCOUNT_INFO"})
PUBLIC_FAILURE_MESSAGE = "결제 요청이 거절됐어요. 결제 수단을 확인하거나 문의해 주세요."


def _text(value: object, limit: int) -> str | None:
    return value[:limit] if isinstance(value, str) and value else None


def toss_payment(data: dict) -> GatewayResult:
    """Map a Toss Payment object to a result."""
    status = _status(data)
    common = {
        "payment_key": _text(data.get("paymentKey"), 200),
        "order_id": _text(data.get("orderId"), 64),
        "amount": data.get("totalAmount") if type(data.get("totalAmount")) is int else None,
        "method": _text(data.get("method"), 30),
    }
    if status == "DONE":
        approved = data.get("approvedAt")
        try:
            approved_at = datetime.fromisoformat(approved) if isinstance(approved, str) else None
        except ValueError:
            approved_at = None
        return GatewayResult("approved", approved_at=approved_at, **common)
    if status in TOSS_PENDING:
        return GatewayResult("pending", **common)
    failure = data.get("failure") if isinstance(data.get("failure"), dict) else {}
    if status in TOSS_FAILED or status in TOSS_CANCELED:
        return GatewayResult(
            "failed",
            code=_text(failure.get("code"), 100) or status,
            message=PUBLIC_FAILURE_MESSAGE,
            canceled=status in TOSS_CANCELED,
            **common,
        )
    raise GatewayUnavailable("Unexpected Toss payment status")


def _time(value: object) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def toss_cancellation(data: dict, amount: int) -> RefundResult:
    """Map a Toss Payment object returned by a cancel request to a result.

    A full refund counts only when the PG says CANCELED and the finished cancellations add up to
    exactly the amount we asked for. Anything else that is not plainly unfinished needs a person.
    """
    status = _status(data)
    cancels = data.get("cancels") if isinstance(data.get("cancels"), list) else []
    done = [
        item
        for item in cancels
        if isinstance(item, dict) and item.get("cancelStatus", "DONE") == "DONE"
    ]
    total = sum(item["cancelAmount"] for item in done if type(item.get("cancelAmount")) is int)
    if status == "CANCELED" and total == amount:
        last = done[-1]
        return RefundResult(
            "refunded",
            transaction_key=_text(last.get("transactionKey"), 64),
            amount=total,
            refunded_at=_time(last.get("canceledAt")),
        )
    if status in ("CANCELED", "PARTIAL_CANCELED"):
        return RefundResult(
            "pending", amount=total, code="REFUND_AMOUNT_MISMATCH", message=f"PG status {status}"
        )
    if status in TOSS_PENDING or status == "DONE":
        return RefundResult("pending", amount=total)
    raise GatewayUnavailable("Unexpected Toss payment status")


def _status(data: object) -> str:
    if not isinstance(data, dict) or not isinstance(data.get("status"), str):
        raise GatewayUnavailable("Unexpected Toss payment body")
    return data["status"]


class TossPaymentsGateway:
    provider = "toss"

    def __init__(self, secret_key: str, base_url: str, timeout: float):
        # Basic auth: base64("<secret key>:"), the key as user and an empty password.
        self._authorization = "Basic " + base64.b64encode((secret_key + ":").encode()).decode()
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    def __repr__(self) -> str:
        return f"TossPaymentsGateway({self._base_url!r})"

    def _send(self, method: str, path: str, body: dict | None, idempotency_key: str | None):
        headers = {"Authorization": self._authorization, "Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(
            self._base_url + path, data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                payload = json.loads(response.read() or b"{}")
                if not isinstance(payload, dict):
                    raise GatewayUnavailable("Unexpected Toss payment body")
                return response.status, payload
        except urllib.error.HTTPError as error:
            try:
                payload = json.loads(error.read() or b"{}")
            except ValueError:
                payload = {}
            return error.code, payload if isinstance(payload, dict) else {}
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            # Includes connection resets and unreadable bodies: the outcome is unknown.
            raise GatewayUnavailable("Toss Payments did not answer") from None

    async def _call(self, method, path, body=None, idempotency_key=None):
        return await run_sync(self._send, method, path, body, idempotency_key)

    def _error(self, status: int, data: dict) -> GatewayResult:
        code = _text(data.get("code"), 100)
        if not 400 <= status < 500 or code not in TOSS_CONFIRM_REJECTIONS:
            raise GatewayUnavailable("Toss Payments result is not final")
        return GatewayResult("failed", code=code, message=PUBLIC_FAILURE_MESSAGE)

    async def confirm(
        self, *, payment_key: str, order_id: str, amount: int, idempotency_key: str
    ) -> GatewayResult:
        status, data = await self._call(
            "POST",
            "/v1/payments/confirm",
            {"paymentKey": payment_key, "orderId": order_id, "amount": amount},
            idempotency_key,
        )
        if status == 200:
            return toss_payment(data)
        if data.get("code") == "ALREADY_PROCESSED_PAYMENT":
            # Approved by an earlier request: read the payment as the PG has it.
            return await self.lookup(payment_key=payment_key)
        return self._error(status, data)

    async def lookup(self, *, payment_key: str) -> GatewayResult:
        status, data = await self._call("GET", "/v1/payments/" + quote(payment_key, safe=""))
        if status == 200:
            return toss_payment(data)
        raise GatewayUnavailable("Toss Payments lookup did not confirm a result")

    async def cancel(
        self, *, payment_key: str, amount: int, reason: str, idempotency_key: str
    ) -> RefundResult:
        """Cancel (refund) the whole payment. The idempotency key makes a resend safe."""
        status, data = await self._call(
            "POST",
            "/v1/payments/" + quote(payment_key, safe="") + "/cancel",
            {"cancelReason": reason},  # no cancelAmount: the PG cancels the full balance
            idempotency_key,
        )
        if status == 200:
            return toss_cancellation(data, amount)
        if data.get("code") == "ALREADY_CANCELED_PAYMENT":
            # An earlier request refunded it (the answer was lost): read what the PG recorded.
            lookup_status, found = await self._call(
                "GET", "/v1/payments/" + quote(payment_key, safe="")
            )
            if lookup_status == 200:
                return toss_cancellation(found, amount)
            raise GatewayUnavailable("Toss Payments result is not final")
        code = _text(data.get("code"), 100)
        if not 400 <= status < 500 or code not in TOSS_CANCEL_REJECTIONS:
            raise GatewayUnavailable("Toss Payments result is not final")
        return RefundResult("failed", code=code, message=PUBLIC_FAILURE_MESSAGE)
