-- Captures where and when a fuel purchase happened, per line item, so recent
-- fuelings can be reported by outstation (see issue #966). Nullable/optional —
-- historical line items simply have no airport/date and are excluded from
-- that report.
ALTER TABLE accts.expense_claim_line_item
    ADD COLUMN fuel_date DATE NULL,
    ADD COLUMN airport VARCHAR(10) NULL REFERENCES static.airfields (ident);
