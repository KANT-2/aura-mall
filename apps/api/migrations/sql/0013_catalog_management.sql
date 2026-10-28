ALTER TABLE products DROP CONSTRAINT products_collection_type_key;
ALTER TABLE products ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE media_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sha256 varchar(64) NOT NULL UNIQUE,
    data bytea NOT NULL, uploaded_by uuid NOT NULL REFERENCES admins(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT media_assets_size_check CHECK (octet_length(data) BETWEEN 1 AND 2097152)
);
ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_action_check;
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_action_check
CHECK (action IN ('product.create','product.update','product.stock','inquiry.update','admin.create','question.answer'));
