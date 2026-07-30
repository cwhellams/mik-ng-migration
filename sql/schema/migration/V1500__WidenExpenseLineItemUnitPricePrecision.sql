-- Widen unit_price precision so per-km mileage rates (e.g. 0.2755 EUR/km) round-trip
-- exactly. DECIMAL(10,2) was silently rounding the rate to cents on insert, before it
-- was multiplied by distance, producing incorrect claim/invoice totals (issue #1023).
ALTER TABLE accts.expense_claim_line_item
    ALTER COLUMN unit_price TYPE NUMERIC(10, 4);
