-- Dedup key for auto-copying a liquid.record_attachment onto the expense claim
-- built from that record: without it, re-saving a claim (every PUT re-derives
-- its fuel line items from the selected records, see #1119's
-- applySelectedFuelRecords) would copy the same receipt again on every save.
-- ON DELETE SET NULL rather than CASCADE: the copy on the claim is a real
-- attachment in its own right (SimplBooks merging, approval review) and must
-- survive the source record or its attachment being deleted later.

ALTER TABLE accts.expense_claim_attachment
    ADD COLUMN source_liquid_attachment_id INTEGER
        NULL REFERENCES liquid.record_attachment (id) ON DELETE SET NULL;

COMMENT ON COLUMN accts.expense_claim_attachment.source_liquid_attachment_id IS
    'Set when this attachment was auto-copied from a liquid record''s own receipt, rather than uploaded directly to the claim.';
