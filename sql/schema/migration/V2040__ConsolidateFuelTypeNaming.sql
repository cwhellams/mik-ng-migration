-- ============================================================
-- V1990__ConsolidateFuelTypeNaming  --  Liquid Management System (#1119)
-- ============================================================
-- Before #1119 the codebase held three spellings of the same four fuels:
--
--   * flight.fuel_types (the reference table):  'JET A-1', '100LL', 'MOGAS 98E5', ...
--   * packages/contracts/src/expenses.ts:       '100LL', 'JetA1', 'mogas'
--   * issue #1119's own wording:                'Jet A-1', '100LL', 'BE98'
--
-- The club's answer was to consolidate on the reference table. This renames the
-- stored values to match and then adds foreign keys, so the three cannot drift
-- apart again -- a value that is not in flight.fuel_types is now rejected by the
-- database rather than silently failing to match anything.
--
-- Two mappings deserve saying out loud:
--
--   * 'JetA1' -> 'JET A-1' is exact.
--   * 'mogas' -> 'MOGAS 98E5' is a choice. The old value did not say which
--     grade, and only OH-IHQ takes MOGAS; 'MOGAS 98E5' is its
--     preferred_fuel_type (V1040). It is also the safe choice for money: the
--     club's answer on #1119 was that all MOGAS grades share one fuel-tax rate,
--     so nothing downstream depends on which one this picks.
--
-- accts.local_fuel_price is renamed in the same statement batch as the line
-- items on purpose: the fuel reimbursement cap (#955) looks the local price up
-- *by fuel type string*, so renaming one without the other would silently stop
-- every claim finding its cap.
--
-- accts.expense_claim_line_item deliberately does NOT get the FK added below.
-- sql/schema/testdata/V240__ExpenseClaimsTestData.sql -- already on main, so
-- branch discipline forbids touching it -- seeds line items with the
-- pre-consolidation 'JetA1' spelling. The schema phase (this file included)
-- runs to completion before the testdata phase even starts
-- (scripts/baseline_database.sh), so a FK added here would reject V240's own
-- inserts before sql/schema/testdata/V350__ConsolidateFuelTypeTestData.sql
-- ever got a chance to rename them. See that file for the test-data half of
-- this rename.

-- ─── accts.expense_claim ─────────────────────────────────────────────────────
UPDATE accts.expense_claim SET fuel_type = 'JET A-1'    WHERE fuel_type = 'JetA1';
UPDATE accts.expense_claim SET fuel_type = 'MOGAS 98E5' WHERE fuel_type = 'mogas';

-- ─── accts.expense_claim_line_item ───────────────────────────────────────────
UPDATE accts.expense_claim_line_item SET fuel_type = 'JET A-1'    WHERE fuel_type = 'JetA1';
UPDATE accts.expense_claim_line_item SET fuel_type = 'MOGAS 98E5' WHERE fuel_type = 'mogas';

-- ─── accts.local_fuel_price ──────────────────────────────────────────────────
UPDATE accts.local_fuel_price SET fuel_type = 'JET A-1'    WHERE fuel_type = 'JetA1';
UPDATE accts.local_fuel_price SET fuel_type = 'MOGAS 98E5' WHERE fuel_type = 'mogas';

-- ─── Guard against a fourth vocabulary ───────────────────────────────────────
-- Any value left over that flight.fuel_types does not know about would fail the
-- constraint below. There is none in production or (after V350) in the test
-- data; this statement makes that a fact the database enforces rather than a
-- hope.
ALTER TABLE accts.expense_claim
    ADD CONSTRAINT expense_claim_fuel_type_fkey
    FOREIGN KEY (fuel_type) REFERENCES flight.fuel_types (name);

ALTER TABLE accts.local_fuel_price
    ADD CONSTRAINT local_fuel_price_fuel_type_fkey
    FOREIGN KEY (fuel_type) REFERENCES flight.fuel_types (name);
