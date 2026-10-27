-- 0007: PG payment attempts per order. Applied after 0006.
-- The amount is copied from orders.total when the attempt is issued; the client never sets it.

CREATE TABLE payments (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id           UUID         NOT NULL REFERENCES orders (id),
    provider           VARCHAR(20)  NOT NULL,
    pg_order_id        VARCHAR(64)  NOT NULL,   -- orderId sent to the PG, one per attempt
    payment_key        VARCHAR(200),            -- PG paymentKey, set when approval is claimed
    amount             INTEGER      NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'READY',
    method             VARCHAR(30),
    failure_code       VARCHAR(100),
    failure_message    VARCHAR(500),
    review_reason      VARCHAR(100),            -- approved at the PG but needs manual handling
    confirm_started_at TIMESTAMPTZ,
    approved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT payments_pg_order_id_key UNIQUE (pg_order_id),
    CONSTRAINT payments_payment_key_key UNIQUE (payment_key),
    CONSTRAINT payments_status_check
        CHECK (status IN ('READY', 'IN_PROGRESS', 'DONE', 'FAILED')),
    CONSTRAINT payments_amount_check CHECK (amount > 0),
    CONSTRAINT payments_pg_order_id_check CHECK (pg_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
    CONSTRAINT payments_claimed_check
        CHECK (status = 'READY' OR (payment_key IS NOT NULL AND confirm_started_at IS NOT NULL)),
    CONSTRAINT payments_approved_check CHECK ((status = 'DONE') = (approved_at IS NOT NULL))
);
-- One open or approved attempt per order: a second approval for the same order cannot exist.
CREATE UNIQUE INDEX payments_order_open_key ON payments (order_id)
    WHERE status IN ('READY', 'IN_PROGRESS', 'DONE');
CREATE INDEX payments_order_idx ON payments (order_id, created_at DESC);
-- Attempts whose result is still unknown, for the reconciliation job.
CREATE INDEX payments_in_progress_idx ON payments (confirm_started_at)
    WHERE status = 'IN_PROGRESS';
