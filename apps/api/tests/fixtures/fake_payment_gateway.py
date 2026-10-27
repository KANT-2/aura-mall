"""Test-only PG. Production never imports this module and no setting selects it.

Mirrors the Toss idempotency rules: the same Idempotency-Key returns the first response,
and a key still being processed answers "processing" (an unknown result).
"""

from datetime import UTC, datetime

import anyio

from aura_api.infra.payment_gateway import GatewayResult, GatewayUnavailable


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
