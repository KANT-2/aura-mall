-- 0006: order status and status change history. Applied after 0005.
-- Existing orders were accepted without payment, so they all start as 'received'.

ALTER TABLE orders
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'received',
    ADD CONSTRAINT orders_status_check
        CHECK (status IN ('received', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'));

-- Every change, including the first 'received' entry (from_status NULL). Rows are only added.
CREATE TABLE order_status_history (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status   VARCHAR(20)  NOT NULL,
    actor_type  VARCHAR(10)  NOT NULL,
    actor_id    UUID,                    -- member or admin id; NULL for system changes
    reason      VARCHAR(200),
    changed_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT order_status_history_from_status_check CHECK (from_status IS NULL OR
        from_status IN ('received', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled')),
    CONSTRAINT order_status_history_to_status_check
        CHECK (to_status IN ('received', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled')),
    CONSTRAINT order_status_history_actor_type_check
        CHECK (actor_type IN ('member', 'admin', 'system')),
    CONSTRAINT order_status_history_actor_check CHECK ((actor_type = 'system') = (actor_id IS NULL))
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, changed_at, id);

-- Existing orders: one system entry at the original order time.
INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, reason, changed_at)
SELECT id, NULL, 'received', 'system', 'migration 0006', created_at FROM orders;
