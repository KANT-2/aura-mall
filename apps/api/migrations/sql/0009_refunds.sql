-- 0009: full refunds of paid orders. Applied after 0008.
-- One row per refund attempt. The PG cancel request uses the refund ID as its idempotency key,
-- so resending an attempt whose result is unknown can never refund twice.

CREATE TABLE refunds (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      UUID         NOT NULL REFERENCES payments (id),
    order_id        UUID         NOT NULL REFERENCES orders (id),
    amount          INTEGER      NOT NULL,   -- copied from payments.amount: full refunds only
    reason          VARCHAR(200) NOT NULL,
    actor_type      VARCHAR(10)  NOT NULL,   -- who asked; recorded in the order history on success
    actor_id        UUID,
    status          VARCHAR(20)  NOT NULL DEFAULT 'IN_PROGRESS',
    transaction_key VARCHAR(64),             -- PG cancel transactionKey, set when refunded
    failure_code    VARCHAR(100),
    failure_message VARCHAR(500),
    review_reason   VARCHAR(100),            -- PG result that needs manual handling
    requested_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    refunded_at     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT refunds_status_check CHECK (status IN ('IN_PROGRESS', 'DONE', 'FAILED')),
    CONSTRAINT refunds_amount_check CHECK (amount > 0),
    CONSTRAINT refunds_actor_type_check CHECK (actor_type IN ('member', 'admin', 'system')),
    CONSTRAINT refunds_actor_check CHECK ((actor_type = 'system') = (actor_id IS NULL)),
    CONSTRAINT refunds_refunded_check CHECK ((status = 'DONE') = (refunded_at IS NOT NULL))
);
-- One pending or finished refund per payment: a second refund cannot exist next to it.
CREATE UNIQUE INDEX refunds_payment_active_key ON refunds (payment_id)
    WHERE status IN ('IN_PROGRESS', 'DONE');
CREATE INDEX refunds_order_idx ON refunds (order_id, requested_at DESC);
-- Refunds whose result is still unknown, for the reconciliation job.
CREATE INDEX refunds_in_progress_idx ON refunds (requested_at) WHERE status = 'IN_PROGRESS';
