-- Mileage claims no longer capture passenger names — MIK does not pay an
-- additional rate for passengers, so this field is unused.
ALTER TABLE accts.expense_mileage_detail
    DROP COLUMN IF EXISTS passengers;
