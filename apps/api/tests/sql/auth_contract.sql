-- TEST FIXTURE ONLY. PR #33 identity base plus UNAPPROVED lifecycle additions.
-- Not an operational migration. Executed only in an explicitly approved isolated test schema.
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(254) NOT NULL,
    name varchar(100) NOT NULL,
    password_hash varchar(255) NOT NULL,
    marketing boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_test_unique ON users (lower(email));
CREATE TABLE revoked_tokens (jti uuid PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE INDEX revoked_expiry_test ON revoked_tokens (expires_at);
-- Everything below is a pending extension, NOT part of merged PR #33.
ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true;
CREATE TABLE auth_token_families (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    revoked_at timestamptz,
    UNIQUE (id, user_id)
);
CREATE INDEX family_user_test ON auth_token_families(user_id);
CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    revoked_at timestamptz,
    access_jti uuid NOT NULL UNIQUE,
    access_expires_at timestamptz NOT NULL,
    FOREIGN KEY (family_id, user_id) REFERENCES auth_token_families(id, user_id) ON DELETE CASCADE,
    CHECK (expires_at > created_at),
    CHECK (access_expires_at > created_at)
);
CREATE INDEX refresh_family_test ON refresh_tokens(family_id);
CREATE INDEX refresh_expiry_test ON refresh_tokens(expires_at);
CREATE INDEX access_expiry_test ON refresh_tokens(access_expires_at);
CREATE UNIQUE INDEX refresh_one_unused_per_family_test ON refresh_tokens(family_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE TABLE user_coupons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    type varchar(30) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'AVAILABLE',
    UNIQUE (user_id, type)
);

-- Admin access tokens (migration 0003): read by is_revoked alongside member tokens.
CREATE TABLE admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status varchar(20) NOT NULL DEFAULT 'active'
);
CREATE TABLE admin_sessions (
    jti uuid PRIMARY KEY,
    admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
