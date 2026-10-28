CREATE TABLE product_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id varchar(50) NOT NULL REFERENCES products(id),
    user_id uuid NOT NULL REFERENCES users(id),
    title varchar(120) NOT NULL,
    content text NOT NULL,
    private boolean NOT NULL DEFAULT true,
    answer text,
    answered_by uuid REFERENCES admins(id),
    answered_at timestamptz,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,
    CONSTRAINT product_questions_version_check CHECK (version >= 1),
    CONSTRAINT product_questions_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    CONSTRAINT product_questions_content_check CHECK (char_length(btrim(content)) BETWEEN 1 AND 3000),
    CONSTRAINT product_questions_answer_check CHECK (answer IS NULL OR char_length(btrim(answer)) BETWEEN 1 AND 3000)
);
CREATE INDEX product_questions_product_created_idx ON product_questions (product_id, created_at DESC);
CREATE INDEX product_questions_user_created_idx ON product_questions (user_id, created_at DESC);
ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_action_check;
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_action_check CHECK (action IN ('product.update', 'product.stock', 'inquiry.update', 'admin.create', 'question.answer'));
ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_check;
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_check CHECK (target_type IN ('product', 'inquiry', 'admin', 'question'));
