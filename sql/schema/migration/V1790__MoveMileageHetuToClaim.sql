-- HETU (Finnish social security number) was stored per mileage-detail row,
-- which only worked because there was exactly one row per claim. Now that a
-- claim can have multiple mileage legs (V1760), HETU is a property of the
-- claimant, not of an individual journey, so it moves up to expense_claim.

ALTER TABLE accts.expense_claim ADD COLUMN hetu_encrypted TEXT NULL;
COMMENT ON COLUMN accts.expense_claim.hetu_encrypted IS 'AES-256-GCM encrypted Finnish social security number (HETU) for mileage claims — GDPR sensitive';

UPDATE accts.expense_claim c
SET hetu_encrypted = sub.hetu_encrypted
FROM (
    SELECT DISTINCT ON (claim_id) claim_id, hetu_encrypted
    FROM accts.expense_mileage_detail
    WHERE hetu_encrypted IS NOT NULL
    ORDER BY claim_id, id
) sub
WHERE c.id = sub.claim_id;

ALTER TABLE accts.expense_mileage_detail DROP COLUMN hetu_encrypted;
