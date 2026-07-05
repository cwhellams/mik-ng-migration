-- Add IBAN bank details to member profile so members can save their
-- reimbursement bank account once and have it auto-populated in expense claims.
ALTER TABLE member.register
    ADD COLUMN IF NOT EXISTS iban TEXT,
    ADD COLUMN IF NOT EXISTS iban_account_name TEXT;


