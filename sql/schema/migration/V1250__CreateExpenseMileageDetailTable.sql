-- Additional detail required for mileage expense claims for Finnish tax records.
-- One row per expense claim (only populated for mileage category claims).

CREATE TABLE accts.expense_mileage_detail (
    id                SERIAL      PRIMARY KEY,
    claim_id          UUID        NOT NULL UNIQUE REFERENCES accts.expense_claim(id) ON DELETE CASCADE,
    route             TEXT        NOT NULL,
    journey_date      DATE        NOT NULL,
    distance_km       NUMERIC(8,2) NOT NULL CHECK (distance_km > 0),
    passengers        TEXT[]      NOT NULL DEFAULT '{}',
    rate_per_km       NUMERIC(6,4) NOT NULL,
    hetu_encrypted    TEXT        NULL,
    board_approved    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  accts.expense_mileage_detail IS 'Tax-record detail for mileage expense claims';
COMMENT ON COLUMN accts.expense_mileage_detail.route          IS 'Free-text route description, e.g. "Helsinki - Tampere - Helsinki"';
COMMENT ON COLUMN accts.expense_mileage_detail.journey_date   IS 'Date of the journey';
COMMENT ON COLUMN accts.expense_mileage_detail.rate_per_km    IS 'Effective rate at time of claim creation (rate_per_km * (1 - discount_pct/100))';
COMMENT ON COLUMN accts.expense_mileage_detail.passengers     IS 'Names of passengers carried during the journey';
COMMENT ON COLUMN accts.expense_mileage_detail.hetu_encrypted IS 'AES-256-GCM encrypted Finnish social security number (HETU) — GDPR sensitive';
COMMENT ON COLUMN accts.expense_mileage_detail.board_approved IS 'True when the journey exceeded the km soft-limit and board approval has been confirmed';
