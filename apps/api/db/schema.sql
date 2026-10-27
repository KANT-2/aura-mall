-- AURA PostgreSQL schema
-- Source of truth: docs/backend/ERD.md (tables, columns, constraints) and the admin API
-- contract in docs/FASTAPI_BFF.md. Run once on an empty database (PostgreSQL 13+):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/schema.sql
-- Then load initial catalog data with db/seed.sql. The cart is not stored (browser only).
-- This file is the latest full schema (migrations 0001 through 0008). Alembic applies the same
-- DDL step by step from migrations/sql/; tests/db checks that both give the same tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- Identity: customers, coupons, logout blacklist (authentication is JWT)
-- Admin accounts live in their own table (admins) with separate login APIs.
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(254) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    marketing     BOOLEAN      NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_active     BOOLEAN      NOT NULL DEFAULT true,   -- false: login refused (0002)
    -- 0005: a deactivated member stays restorable until deletion_scheduled_at. The purge job
    -- anonymizes the account afterwards and records deleted_at; orders keep their user_id.
    deletion_requested_at TIMESTAMPTZ,
    deletion_scheduled_at TIMESTAMPTZ,
    deleted_at            TIMESTAMPTZ,
    CONSTRAINT users_deletion_schedule_check
        CHECK ((deletion_requested_at IS NULL) = (deletion_scheduled_at IS NULL)),
    CONSTRAINT users_deletion_inactive_check
        CHECK ((deletion_requested_at IS NULL AND deleted_at IS NULL) OR NOT is_active)
);
-- Emails are stored lower-cased; the index also blocks case-only duplicates.
ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD CONSTRAINT users_deactivated_inactive_check
    CHECK (deactivated_at IS NULL OR NOT is_active);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email)) WHERE deactivated_at IS NULL;
CREATE INDEX users_deletion_due_idx ON users (deletion_scheduled_at)
    WHERE deletion_scheduled_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE user_coupons (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type          VARCHAR(30) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    used_order_id UUID,       -- FK to orders added below (orders references coupons too)
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at       TIMESTAMPTZ,
    CONSTRAINT user_coupons_type_check CHECK (type IN ('FREE_SHIPPING')),
    CONSTRAINT user_coupons_status_check CHECK (status IN ('AVAILABLE', 'USED')),
    CONSTRAINT user_coupons_user_type_key UNIQUE (user_id, type)
);

-- Operator accounts, separate from customers: own login/registration APIs and tokens.
CREATE TABLE admins (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(254) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_by    UUID         REFERENCES admins (id),   -- NULL for the first admin
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT admins_status_check CHECK (status IN ('active', 'disabled'))
);
CREATE UNIQUE INDEX admins_email_lower_key ON admins (lower(email));

-- jti of customer or admin tokens signed out before they expired; prune past expires_at.
-- The API issues every token, so jti is always a UUID; a non-UUID jti is rejected before lookup.
CREATE TABLE revoked_tokens (
    jti        UUID        PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX revoked_tokens_expires_at_idx ON revoked_tokens (expires_at);

-- JWT refresh tokens (0002). Each row also records the access token issued with it.
-- One family per login. Reusing a consumed refresh token revokes the whole family.
-- The row is also the lock target when two refreshes race.
CREATE TABLE auth_token_families (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT auth_token_families_id_user_id_key UNIQUE (id, user_id)
);
CREATE INDEX auth_token_families_user_id_idx ON auth_token_families (user_id);

-- Only the SHA-256 hex of a refresh token is stored. Each row also records the access
-- token issued with it, so revoking a family can block those access tokens too.
CREATE TABLE refresh_tokens (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL,
    family_id         UUID        NOT NULL,
    token_hash        VARCHAR(64) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    consumed_at       TIMESTAMPTZ,
    revoked_at        TIMESTAMPTZ,
    access_jti        UUID        NOT NULL,
    access_expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT refresh_tokens_family_id_fkey FOREIGN KEY (family_id, user_id)
        REFERENCES auth_token_families (id, user_id) ON DELETE CASCADE,
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_access_jti_key UNIQUE (access_jti),
    CONSTRAINT refresh_tokens_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT refresh_tokens_expires_check CHECK (expires_at > created_at),
    CONSTRAINT refresh_tokens_access_expires_check CHECK (access_expires_at > created_at)
);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
CREATE INDEX refresh_tokens_access_expires_at_idx ON refresh_tokens (access_expires_at);
-- At most one usable refresh token per family at any time.
CREATE UNIQUE INDEX refresh_tokens_family_active_key ON refresh_tokens (family_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- Admin access tokens (0003).
-- The JWT verifier only accepts tokens it has a record of; customer tokens are recorded in
-- refresh_tokens, admin tokens here. Admins get no refresh token (access only).
CREATE TABLE admin_sessions (
    jti        UUID        PRIMARY KEY,
    admin_id   UUID        NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,              -- set by logout
    CONSTRAINT admin_sessions_expires_check CHECK (expires_at > issued_at)
);
CREATE INDEX admin_sessions_admin_id_idx ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions (expires_at);

-- Consecutive member login failures per normalized email, stored only as a SHA-256 hex (0005).
-- Unknown emails get rows too so the limit never reveals whether an account exists.
CREATE TABLE login_failures (
    email_hash    VARCHAR(64) PRIMARY KEY,
    failure_count INTEGER     NOT NULL DEFAULT 0,
    locked_until  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT login_failures_email_hash_check CHECK (email_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT login_failures_failure_count_check CHECK (failure_count >= 0)
);
CREATE INDEX login_failures_updated_at_idx ON login_failures (updated_at);

-- One row per member purge execution, including dry runs (0005). A row left in 'running'
-- means the process stopped before recording its result.
CREATE TABLE member_deletion_runs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'running',
    dry_run         BOOLEAN     NOT NULL,
    eligible        INTEGER     NOT NULL DEFAULT 0,
    deleted         INTEGER     NOT NULL DEFAULT 0,
    failed          INTEGER     NOT NULL DEFAULT 0,
    failed_user_ids UUID[]      NOT NULL DEFAULT '{}',
    CONSTRAINT member_deletion_runs_status_check
        CHECK (status IN ('running', 'succeeded', 'partial', 'failed'))
);

-- ---------------------------------------------------------------------------
-- Catalog: original string IDs from apps/web/mock-server/fixtures/catalog.json
-- ---------------------------------------------------------------------------

CREATE TABLE collections (
    id          VARCHAR(20)  PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    title       VARCHAR(100) NOT NULL,
    description TEXT         NOT NULL,
    color       CHAR(7)      NOT NULL,
    notes       TEXT[]       NOT NULL DEFAULT '{}',
    sort_order  SMALLINT     NOT NULL
);

CREATE TABLE product_types (
    id         VARCHAR(30) PRIMARY KEY,
    name       VARCHAR(50) NOT NULL,   -- Product.typeName
    label      VARCHAR(50) NOT NULL,
    sort_order SMALLINT    NOT NULL
);

CREATE TABLE products (
    id              VARCHAR(50)  PRIMARY KEY,
    collection_id   VARCHAR(20)  NOT NULL REFERENCES collections (id),
    type_id         VARCHAR(30)  NOT NULL REFERENCES product_types (id),
    name            VARCHAR(100) NOT NULL,
    english_name    VARCHAR(100) NOT NULL,
    volume          VARCHAR(30)  NOT NULL,
    price           INTEGER,     -- NULL = 가격 확인 중 (never 0)
    stock           INTEGER      NOT NULL,
    image           VARCHAR(255) NOT NULL,
    image_url       VARCHAR(255) NOT NULL,
    description     TEXT         NOT NULL,
    category        VARCHAR(50)  NOT NULL,
    notes           TEXT[]       NOT NULL DEFAULT '{}',
    note_images     JSONB,
    gift_images     TEXT[],
    featured        BOOLEAN      NOT NULL DEFAULT false,
    is_new          BOOLEAN      NOT NULL DEFAULT false,
    bestseller_rank SMALLINT,
    sort_order      SMALLINT     NOT NULL,
    version         INTEGER      NOT NULL DEFAULT 1,   -- admin optimistic lock
    updated_at      TIMESTAMPTZ,
    CONSTRAINT products_price_check CHECK (price IS NULL OR price BETWEEN 0 AND 10000000),
    CONSTRAINT products_stock_check CHECK (stock BETWEEN 0 AND 99999),
    CONSTRAINT products_version_check CHECK (version >= 1),
    CONSTRAINT products_collection_type_key UNIQUE (collection_id, type_id),
    CONSTRAINT products_bestseller_rank_key UNIQUE (bestseller_rank)
);
CREATE INDEX products_collection_idx ON products (collection_id);
CREATE INDEX products_type_idx ON products (type_id);

CREATE TABLE ingredients (
    id          VARCHAR(30) PRIMARY KEY,
    name        VARCHAR(30) NOT NULL,
    stage       VARCHAR(10) NOT NULL,
    color       CHAR(7)     NOT NULL,
    description TEXT        NOT NULL,
    sort_order  SMALLINT    NOT NULL,
    CONSTRAINT ingredients_stage_check CHECK (stage IN ('top', 'middle', 'base'))
);

CREATE TABLE scent_families (
    id          VARCHAR(30) PRIMARY KEY,
    name        VARCHAR(30) NOT NULL,
    english     VARCHAR(30) NOT NULL,
    asset       VARCHAR(50) NOT NULL,
    description TEXT        NOT NULL,
    sort_order  SMALLINT    NOT NULL
);

CREATE TABLE scent_family_ingredients (
    family_id     VARCHAR(30) NOT NULL REFERENCES scent_families (id) ON DELETE CASCADE,
    ingredient_id VARCHAR(30) NOT NULL REFERENCES ingredients (id),
    position      SMALLINT    NOT NULL,
    PRIMARY KEY (family_id, ingredient_id)
);

CREATE TABLE suggested_names (
    id            SERIAL      PRIMARY KEY,
    collection_id VARCHAR(20) NOT NULL REFERENCES collections (id),
    name          VARCHAR(30) NOT NULL,
    sort_order    SMALLINT    NOT NULL,
    CONSTRAINT suggested_names_collection_name_key UNIQUE (collection_id, name)
);

CREATE TABLE promotions (
    id         SERIAL       PRIMARY KEY,
    audience   VARCHAR(10)  NOT NULL,
    title      VARCHAR(100) NOT NULL,
    copy       TEXT         NOT NULL,
    cta        VARCHAR(50)  NOT NULL,
    url        VARCHAR(255) NOT NULL,
    image      VARCHAR(255) NOT NULL,
    sort_order SMALLINT     NOT NULL,
    CONSTRAINT promotions_audience_check CHECK (audience IN ('guest', 'member')),
    CONSTRAINT promotions_audience_order_key UNIQUE (audience, sort_order)
);

-- ---------------------------------------------------------------------------
-- Atelier: saved recipes (never edited; a remake is a new version) and drafts
-- ---------------------------------------------------------------------------

CREATE TABLE recipes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    parent_id  UUID        REFERENCES recipes (id) ON DELETE SET NULL,
    version    SMALLINT    NOT NULL,
    name       VARCHAR(30) NOT NULL,
    label      VARCHAR(10) NOT NULL,
    color      CHAR(7)     NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT recipes_version_check CHECK (version >= 1),
    CONSTRAINT recipes_label_check CHECK (label IN ('classic', 'paper', 'minimal'))
);
CREATE INDEX recipes_user_created_idx ON recipes (user_id, created_at DESC);

-- Total drops per recipe (1–20) spans rows and is enforced by the domain layer.
CREATE TABLE recipe_ingredients (
    recipe_id     UUID        NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
    ingredient_id VARCHAR(30) NOT NULL REFERENCES ingredients (id),
    count         SMALLINT    NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id),
    CONSTRAINT recipe_ingredients_count_check CHECK (count BETWEEN 1 AND 20)
);

CREATE TABLE atelier_drafts (
    guest_id   UUID        PRIMARY KEY,   -- guestId from the JWT (issued as UUID)
    counts     JSONB       NOT NULL,
    name       VARCHAR(30) NOT NULL DEFAULT '',
    label      VARCHAR(10) NOT NULL,
    step       VARCHAR(10) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT atelier_drafts_label_check CHECK (label IN ('classic', 'paper', 'minimal')),
    CONSTRAINT atelier_drafts_step_check CHECK (step IN ('select', 'result'))
);

-- ---------------------------------------------------------------------------
-- Ordering: order intake (no payment); items keep snapshots, no product FK
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users (id),
    recipient       VARCHAR(100) NOT NULL,
    address         VARCHAR(500) NOT NULL,
    items_amount    INTEGER      NOT NULL,
    shipping_fee    INTEGER      NOT NULL,
    total           INTEGER      NOT NULL,
    coupon_id       UUID         REFERENCES user_coupons (id),
    idempotency_key VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status          VARCHAR(20)  NOT NULL DEFAULT 'received',  -- 0006, accepted without payment
    CONSTRAINT orders_status_check
        CHECK (status IN ('received', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled')),
    CONSTRAINT orders_amounts_check
        CHECK (items_amount >= 0 AND shipping_fee >= 0 AND total = items_amount + shipping_fee),
    CONSTRAINT orders_user_idempotency_key UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_created_idx ON orders (created_at DESC);
-- Unpaid orders oldest first, for the expiry job (0008).
CREATE INDEX orders_unpaid_created_idx ON orders (created_at) WHERE status = 'received';

ALTER TABLE user_coupons
    ADD CONSTRAINT user_coupons_used_order_fkey
    FOREIGN KEY (used_order_id) REFERENCES orders (id);

CREATE TABLE order_items (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         UUID         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    position         SMALLINT     NOT NULL,
    line_key         VARCHAR(200) NOT NULL,
    kind             VARCHAR(10)  NOT NULL,
    product_id       VARCHAR(50)  NOT NULL,   -- reference only: the product may change or go away
    product_snapshot JSONB        NOT NULL,   -- Product as shown at order time
    unit_price       INTEGER      NOT NULL,
    quantity         SMALLINT     NOT NULL,
    custom           JSONB,                   -- custom composition, when kind = 'custom'
    CONSTRAINT order_items_kind_check CHECK (kind IN ('product', 'gift_set', 'custom')),
    CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0),
    CONSTRAINT order_items_quantity_check CHECK (quantity BETWEEN 1 AND 15),
    CONSTRAINT order_items_order_position_key UNIQUE (order_id, position)
);

CREATE TABLE order_item_selections (
    order_item_id UUID         NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
    product_id    VARCHAR(50)  NOT NULL,
    product_name  VARCHAR(100) NOT NULL,
    unit_price    INTEGER      NOT NULL,
    position      SMALLINT     NOT NULL,
    PRIMARY KEY (order_item_id, product_id)
);

-- Every order status change, including the first 'received' entry (from_status NULL) (0006).
-- Rows are only added.
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

-- PG payment attempts per order (0007). The amount is copied from orders.total when issued.
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
    -- CANCELED (0008): a READY attempt closed because its order was cancelled.
    CONSTRAINT payments_status_check
        CHECK (status IN ('READY', 'IN_PROGRESS', 'DONE', 'FAILED', 'CANCELED')),
    CONSTRAINT payments_amount_check CHECK (amount > 0),
    CONSTRAINT payments_pg_order_id_check CHECK (pg_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
    CONSTRAINT payments_claimed_check
        CHECK (status IN ('READY', 'CANCELED')
               OR (payment_key IS NOT NULL AND confirm_started_at IS NOT NULL)),
    CONSTRAINT payments_approved_check CHECK ((status = 'DONE') = (approved_at IS NOT NULL))
);
-- One open or approved attempt per order: a second approval for the same order cannot exist.
CREATE UNIQUE INDEX payments_order_open_key ON payments (order_id)
    WHERE status IN ('READY', 'IN_PROGRESS', 'DONE');
CREATE INDEX payments_order_idx ON payments (order_id, created_at DESC);
-- Attempts whose result is still unknown, for the reconciliation job.
CREATE INDEX payments_in_progress_idx ON payments (confirm_started_at)
    WHERE status = 'IN_PROGRESS';

-- Full refunds of paid orders (0009). The refund ID is the PG cancel idempotency key.
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

-- ---------------------------------------------------------------------------
-- Partner inquiries (+ admin handling status)
-- ---------------------------------------------------------------------------

CREATE TABLE partner_inquiries (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand         VARCHAR(100) NOT NULL,
    name          VARCHAR(50)  NOT NULL,
    email         VARCHAR(254) NOT NULL,
    website       VARCHAR(255),
    type          VARCHAR(30)  NOT NULL,
    introduction  TEXT         NOT NULL,
    message       TEXT         NOT NULL,
    consent       BOOLEAN      NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'received',
    internal_memo TEXT         NOT NULL DEFAULT '',
    version       INTEGER      NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ,
    CONSTRAINT partner_inquiries_consent_check CHECK (consent),
    CONSTRAINT partner_inquiries_text_length_check
        CHECK (char_length(introduction) <= 3000 AND char_length(message) <= 3000),
    CONSTRAINT partner_inquiries_status_check CHECK (status IN ('received', 'reviewing', 'done')),
    CONSTRAINT partner_inquiries_version_check CHECK (version >= 1)
);
CREATE INDEX partner_inquiries_status_created_idx ON partner_inquiries (status, created_at DESC);
CREATE INDEX partner_inquiries_email_created_idx
    ON partner_inquiries (lower(email), created_at DESC);

-- ---------------------------------------------------------------------------
-- Admin: stock adjustments and audit log
-- ---------------------------------------------------------------------------

CREATE TABLE stock_adjustments (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   VARCHAR(50)  NOT NULL REFERENCES products (id),
    delta        INTEGER      NOT NULL,
    stock_before INTEGER      NOT NULL,
    stock_after  INTEGER      NOT NULL,
    reason       VARCHAR(200) NOT NULL,
    request_key  VARCHAR(64)  NOT NULL,   -- idempotency key from the admin screen
    actor_id     UUID         NOT NULL REFERENCES admins (id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT stock_adjustments_delta_check CHECK (delta <> 0),
    CONSTRAINT stock_adjustments_after_check
        CHECK (stock_after = stock_before + delta AND stock_after BETWEEN 0 AND 99999),
    CONSTRAINT stock_adjustments_reason_check CHECK (char_length(btrim(reason)) > 0),
    CONSTRAINT stock_adjustments_request_key UNIQUE (request_key)
);
CREATE INDEX stock_adjustments_product_created_idx
    ON stock_adjustments (product_id, created_at DESC);

CREATE TABLE admin_audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID        NOT NULL REFERENCES admins (id),
    action      VARCHAR(40) NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id   VARCHAR(64) NOT NULL,
    changes     JSONB       NOT NULL DEFAULT '[]',   -- [{ field, from, to }]; memo shows change only
    reason      VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT admin_audit_logs_action_check
        CHECK (action IN ('product.update', 'product.stock', 'inquiry.update', 'admin.create')),
    CONSTRAINT admin_audit_logs_target_check CHECK (target_type IN ('product', 'inquiry', 'admin'))
);
CREATE INDEX admin_audit_logs_target_idx
    ON admin_audit_logs (target_type, target_id, created_at DESC);

COMMIT;
