-- Field-level diff log for treasurer edits to a submitted/pending-info expense claim
-- before it's approved (issue #1028) — lets a treasurer fix small mistakes (wrong item
-- code, wrong airport, etc.) without sending the claim back to the member, while still
-- keeping a full audit trail of exactly what changed, since this is financial data.

CREATE TABLE accts.expense_claim_edit_audit (
    id           SERIAL      PRIMARY KEY,
    claim_id     UUID        NOT NULL REFERENCES accts.expense_claim(id) ON DELETE CASCADE,
    line_item_id INT         NULL,
    field_name   TEXT        NOT NULL,
    old_value    TEXT        NULL,
    new_value    TEXT        NULL,
    edited_by    TEXT        NOT NULL REFERENCES member.register(member_id),
    edited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX expense_claim_edit_audit_claim_id_idx ON accts.expense_claim_edit_audit (claim_id);

COMMENT ON TABLE  accts.expense_claim_edit_audit IS 'Field-level diff log for treasurer edits to a claim before approval';
COMMENT ON COLUMN accts.expense_claim_edit_audit.line_item_id IS 'NULL for claim-level field changes (title, aircraft, expense date)';
