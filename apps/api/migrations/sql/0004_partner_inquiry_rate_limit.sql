CREATE INDEX partner_inquiries_email_created_idx
    ON partner_inquiries (lower(email), created_at DESC);
