-- Audit trail of every plaintext HETU reveal on a mileage claim (issue #1022).
-- Deliberately narrow to this one use case for now — the reveal endpoint is the
-- only writer, and the endpoint fails closed if the insert below fails.

CREATE TABLE accts.mileage_hetu_access_audit (
    id          SERIAL      PRIMARY KEY,
    -- No ON DELETE CASCADE: this is an audit trail, not regular data — it must
    -- survive even if the claim it refers to is later deleted (e.g. a member
    -- deleting their own still-DRAFT claim).
    claim_id    UUID        NOT NULL REFERENCES accts.expense_claim(id),
    accessed_by VARCHAR(9)  NOT NULL REFERENCES member.register(member_id),
    context     TEXT        NOT NULL,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mileage_hetu_access_audit_claim ON accts.mileage_hetu_access_audit (claim_id);

COMMENT ON TABLE  accts.mileage_hetu_access_audit IS 'Audit trail of every plaintext HETU reveal on a mileage claim';
COMMENT ON COLUMN accts.mileage_hetu_access_audit.accessed_by IS 'Member who revealed the HETU (must hold expense.hetu_admin)';
COMMENT ON COLUMN accts.mileage_hetu_access_audit.context IS 'Where the reveal happened, e.g. CLAIM_REVEAL';

-- Supports the Tulorekisteri report's date-range filter and the retention purge job.
CREATE INDEX idx_expense_mileage_detail_journey_date ON accts.expense_mileage_detail (journey_date);
