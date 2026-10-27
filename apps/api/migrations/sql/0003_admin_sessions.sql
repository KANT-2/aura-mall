-- 0003: admin access tokens. Applied after 0002.
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
