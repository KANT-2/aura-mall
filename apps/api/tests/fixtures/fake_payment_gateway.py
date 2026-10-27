"""Test-only PG. Production never imports this module and no setting selects it.

Mirrors the Toss idempotency rules: the same Idempotency-Key returns the first response,
and a key still being processed answers "processing" (an unknown result). Cancelling an
already canceled payment with a new key is refused like Toss (ALREADY_CANCELED_PAYMENT), and the
fake then reads the recorded cancellation back.
"""

from datetime import UTC, datetime

import anyio

from aura_api.infra.payment_gateway import GatewayResult, GatewayUnavailable, RefundResult


class FakePaymentGateway:
    provider = "toss"

    def __init__(self):
        # payment_key → "approve" | "reject" | "down" (never reaches the PG)
        # | "lost" (approved at the PG, response lost once)
        self.behavior: dict[str, str] = {}
        self.delay = 0.0
        self.calls: list[dict] = []
        self.responses: dict[str, GatewayResult] = {}
        self.processing: set[str] = set()
        self.approvals = 0
        # Cancel side. refund_behavior[payment_key]: "refund" | "reject" | "down" (never reaches
        # the PG) | "lost" (refunded at the PG, response lost once) | "mismatch" (partial amount).
        self.refund_behavior: dict[str, str] = {}
        self.refund_calls: list[dict] = []
        self.refund_responses: dict[str, RefundResult] = {}
        self.refund_processing: set[str] = set()
        self.refunded: dict[str, RefundResult] = {}  # payment_key → the one real refund
        self.refund_count = 0
        self.cancel_hook = None  # async callable run at the start of every cancel call

    async def confirm(self, *, payment_key, order_id, amount, idempotency_key):
        self.calls.append(
            {
                "payment_key": payment_key,
                "order_id": order_id,
                "amount": amount,
                "key": idempotency_key,
            }
        )
        if idempotency_key in self.responses:
            return self.responses[idempotency_key]
        if idempotency_key in self.processing:
            raise GatewayUnavailable("IDEMPOTENT_REQUEST_PROCESSING")
        mode = self.behavior.get(payment_key, "approve")
        if mode == "down":
            raise GatewayUnavailable("timeout before the PG")
        self.processing.add(idempotency_key)
        try:
            if self.delay:
                await anyio.sleep(self.delay)
            if mode == "reject":
                result = GatewayResult(
                    "failed", code="REJECT_CARD_PAYMENT", message="카드 승인이 거절됐어요."
                )
            else:
                result = GatewayResult(
                    "approved",
                    payment_key=payment_key,
                    order_id=order_id,
                    amount=amount,
                    method="카드",
                    approved_at=datetime.now(UTC),
                )
                self.approvals += 1
            self.responses[idempotency_key] = result
        finally:
            self.processing.discard(idempotency_key)
        if mode == "lost":
            self.behavior[payment_key] = "approve"
            raise GatewayUnavailable("response lost after approval")
        return result

    async def lookup(self, *, payment_key):
        for result in self.responses.values():
            if result.payment_key == payment_key:
                return result
        return GatewayResult("failed", code="NOT_FOUND_PAYMENT")

    async def cancel(self, *, payment_key, amount, reason, idempotency_key):
        self.refund_calls.append(
            {"payment_key": payment_key, "amount": amount, "reason": reason, "key": idempotency_key}
        )
        if self.cancel_hook is not None:
            await self.cancel_hook()
        if idempotency_key in self.refund_responses:
            return self.refund_responses[idempotency_key]
        if idempotency_key in self.refund_processing:
            raise GatewayUnavailable("IDEMPOTENT_REQUEST_PROCESSING")
        mode = self.refund_behavior.get(payment_key, "refund")
        if mode == "down":
            raise GatewayUnavailable("timeout before the PG")
        approved = next((r for r in self.responses.values() if r.payment_key == payment_key), None)
        if approved is None or approved.outcome != "approved":
            return RefundResult("failed", code="NOT_FOUND_PAYMENT", message="no such payment")
        if payment_key in self.refunded:
            # Toss: ALREADY_CANCELED_PAYMENT, then the client reads the payment back.
            return self.refunded[payment_key]
        self.refund_processing.add(idempotency_key)
        try:
            if self.delay:
                await anyio.sleep(self.delay)
            if mode == "reject":
                result = RefundResult("failed", code="NOT_CANCELABLE_PAYMENT", message="거절")
            elif mode == "mismatch":
                result = RefundResult("pending", amount=amount - 1, code="REFUND_AMOUNT_MISMATCH")
            else:
                result = RefundResult(
                    "refunded",
                    transaction_key="tx_" + idempotency_key.replace("-", ""),
                    amount=amount,
                    refunded_at=datetime.now(UTC),
                )
                self.refunded[payment_key] = result
                self.refund_count += 1
            self.refund_responses[idempotency_key] = result
        finally:
            self.refund_processing.discard(idempotency_key)
        if mode == "lost":
            self.refund_behavior[payment_key] = "refund"
            raise GatewayUnavailable("response lost after the refund")
        return result
