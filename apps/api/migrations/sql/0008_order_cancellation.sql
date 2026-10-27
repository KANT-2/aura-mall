-- 0008: closing unused payment attempts when an order is cancelled, and finding unpaid orders.
-- Applied after 0007. Existing rows already satisfy the new checks.

-- CANCELED: a READY attempt closed because its order was cancelled. It never reached the PG
-- approval, so it has no paymentKey, and it no longer holds the order's open-payment slot.
ALTER TABLE payments
    DROP CONSTRAINT payments_status_check,
    DROP CONSTRAINT payments_claimed_check,
    ADD CONSTRAINT payments_status_check
        CHECK (status IN ('READY', 'IN_PROGRESS', 'DONE', 'FAILED', 'CANCELED')),
    ADD CONSTRAINT payments_claimed_check
        CHECK (status IN ('READY', 'CANCELED')
               OR (payment_key IS NOT NULL AND confirm_started_at IS NOT NULL));

-- Unpaid orders oldest first, for the expiry job.
CREATE INDEX orders_unpaid_created_idx ON orders (created_at) WHERE status = 'received';
