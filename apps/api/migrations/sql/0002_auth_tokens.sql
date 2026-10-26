-- 0002: JWT refresh tokens and member status. Applied after 0001.
-- Access tokens stay stateless; logout still records their jti in revoked_tokens.

-- Existing members are active; the column lets login refuse a suspended member.
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

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
