-- Multiple attachments per expense claim (issue #955) — SimplBooks only accepts a
-- single attachment per purchase, so at approval time all attachments are merged into
-- one PDF (see mergeAttachmentsToPdf). The existing singular receipt_* columns on
-- expense_claim are left untouched for old claims; new claims use this table instead.

CREATE TABLE accts.expense_claim_attachment (
    id          SERIAL       PRIMARY KEY,
    claim_id    UUID         NOT NULL REFERENCES accts.expense_claim(id) ON DELETE CASCADE,
    storage_key TEXT         NOT NULL,
    file_name   TEXT         NOT NULL,
    file_size   BIGINT       NOT NULL,
    mime_type   TEXT         NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX expense_claim_attachment_claim_id_idx ON accts.expense_claim_attachment (claim_id);

COMMENT ON TABLE accts.expense_claim_attachment IS 'Multiple receipt attachments per claim, merged into one PDF at approval time for SimplBooks';
