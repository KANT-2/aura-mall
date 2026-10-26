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
ALTER TABLE users ADD COLUMN is_active boolean NOT NULL;
CREATE TABLE auth_token_families (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
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
    FOREIGN KEY (family_id, user_id) REFERENCES auth_token_families(id, user_id),
    CHECK (expires_at > created_at)
);
CREATE INDEX refresh_family_test ON refresh_tokens(family_id);
CREATE INDEX refresh_expiry_test ON refresh_tokens(expires_at);
CREATE TABLE auth_access_tokens (
    jti uuid PRIMARY KEY,
    family_id uuid NOT NULL REFERENCES auth_token_families(id),
    expires_at timestamptz NOT NULL
);
CREATE INDEX access_family_test ON auth_access_tokens(family_id);
CREATE INDEX access_expiry_test ON auth_access_tokens(expires_at);
