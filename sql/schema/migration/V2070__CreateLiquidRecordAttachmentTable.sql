-- Optional receipt photo/PDF captured at the point a member reports a self-paid
-- fuelling (provider requires_claim = TRUE), so they don't have to remember to
-- attach it later in the expense claim wizard. Modelled directly on
-- accts.expense_claim_attachment (V1830) -- same shape, different owner. No
-- sort_order: unlike a claim's merged-into-one-PDF attachments, these are never
-- reordered, only copied onto a claim (see V2010's source_liquid_attachment_id).
--
-- liquid already has ALTER DEFAULT PRIVILEGES from V2010, so this table needs no
-- separate GRANT.

CREATE TABLE liquid.record_attachment (
    id          SERIAL       PRIMARY KEY,
    record_id   UUID         NOT NULL REFERENCES liquid.record (record_id) ON DELETE CASCADE,
    storage_key TEXT         NOT NULL,
    file_name   TEXT         NOT NULL,
    file_size   BIGINT       NOT NULL,
    mime_type   TEXT         NOT NULL,
    uploaded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX record_attachment_record_id_idx ON liquid.record_attachment (record_id);

COMMENT ON TABLE liquid.record_attachment IS
    'Optional receipt(s) captured when reporting a self-paid fuelling, copied onto the expense claim the record ends up on (#1119 follow-up).';
