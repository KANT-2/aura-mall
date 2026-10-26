-- AURA PostgreSQL schema
-- Source of truth: docs/backend/ERD.md (tables, columns, constraints) and the admin API
-- contract in docs/FASTAPI_BFF.md. Run once on an empty database (PostgreSQL 13+):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/schema.sql
-- Then load initial catalog data with db/seed.sql. The cart is not stored (browser only).

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
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Emails are stored lower-cased; the index also blocks case-only duplicates.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

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
CREATE TABLE revoked_tokens (
    jti        VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX revoked_tokens_expires_at_idx ON revoked_tokens (expires_at);

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
    guest_id   VARCHAR(64) PRIMARY KEY,   -- guestId from the JWT
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
    CONSTRAINT orders_amounts_check
        CHECK (items_amount >= 0 AND shipping_fee >= 0 AND total = items_amount + shipping_fee),
    CONSTRAINT orders_user_idempotency_key UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_created_idx ON orders (created_at DESC);

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
