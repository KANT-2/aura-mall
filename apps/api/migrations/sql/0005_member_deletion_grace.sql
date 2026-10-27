-- 0005: 30-day member deletion grace period, login failure limits and purge run records.
-- Applied after 0004. Existing rows keep NULL deletion columns (no automatic backfill).

-- A deactivated member stays restorable until deletion_scheduled_at. The purge job
-- anonymizes the account afterwards and records deleted_at; orders keep their user_id.
ALTER TABLE users
    ADD COLUMN deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN deletion_scheduled_at TIMESTAMPTZ,
    ADD COLUMN deleted_at            TIMESTAMPTZ,
    ADD CONSTRAINT users_deletion_schedule_check
        CHECK ((deletion_requested_at IS NULL) = (deletion_scheduled_at IS NULL)),
    ADD CONSTRAINT users_deletion_inactive_check
        CHECK ((deletion_requested_at IS NULL AND deleted_at IS NULL) OR NOT is_active);
CREATE INDEX users_deletion_due_idx ON users (deletion_scheduled_at)
    WHERE deletion_scheduled_at IS NOT NULL AND deleted_at IS NULL;

-- Consecutive member login failures per normalized email, stored only as a SHA-256 hex.
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

-- One row per purge execution, including dry runs. A row left in 'running' means the
-- process stopped before recording its result.
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
