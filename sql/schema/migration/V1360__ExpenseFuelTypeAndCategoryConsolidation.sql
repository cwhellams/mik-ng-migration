-- Fuel type now lives on each line item (aircraft/fuel selection moved from claim-level
-- step 2 down to the per-line-item level in step 5).
ALTER TABLE accts.expense_claim_line_item
    ADD COLUMN fuel_type TEXT NULL;

-- Consolidate member-facing expense categories down to Fuel / Mileage / Other.
-- Existing claims keep their original category_id (FK), we only relabel and hide
-- the categories that are no longer offered when creating a new claim.
UPDATE accts.expense_category
SET label_en = 'Other', label_fi = 'Muu', label_sv = 'Övrigt'
WHERE code = 'misc';

UPDATE accts.expense_category
SET active = FALSE
WHERE code IN ('travel', 'aircraft_supplies', 'web');
