-- ============================================================
-- Liquid Management System (#1119) — test-data half of the fuel-type rename
-- ============================================================
-- sql/schema/testdata/V240__ExpenseClaimsTestData.sql is already on main, so
-- branch discipline forbids editing it in place (see copilot-instructions.md,
-- "Branch discipline for SQL files") -- it still seeds
-- accts.expense_claim_line_item.fuel_type with the pre-consolidation 'JetA1'
-- spelling. sql/schema/migration/V1990__ConsolidateFuelTypeNaming.sql renames
-- the equivalent production values and is a new file in this branch, but it
-- runs during the schema phase, which completes in full before the testdata
-- phase (this file's phase) even starts -- so it never sees rows V240 hasn't
-- inserted yet. This file finishes the rename for those rows instead, once
-- they exist.
UPDATE accts.expense_claim_line_item
SET fuel_type = 'JET A-1'
WHERE fuel_type = 'JetA1';
