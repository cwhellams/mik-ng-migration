-- ============================================================
-- Liquid Management System (#1119) — richer local/dev test data
-- ============================================================
-- V340/V350 seed only the fixed reference data (providers, pumps). This file
-- adds actual oil canisters and fuel/oil records so every screen of the
-- feature has something to show in local/dev environments: home-base
-- fuellings (invoiced to the club, no cost to enter), away fuellings from
-- several kinds of provider (AirBP, Kanair, own payment, one in USD to
-- exercise the ccy/fxRate fields), oil drawn from club inventory vs. bought
-- elsewhere, records linked to flight logs (one still NEW, one already
-- processed so the record shows up locked), and two of the away fuellings
-- carried through onto an expense claim exactly the way a member would do it
-- from the UI.
--
-- Deliberately kept off Matti1/Pekka1/Juha1/Liisa1/k1mnimda: those are the
-- fixed identities apps/backend/test/routes/liquid/testSupport.ts signs in as
-- and asserts exact record counts for, so seeding rows under those ids would
-- make member-scoped list totals in that suite flaky. Jukka1/Anna1/Kaisa1 own
-- nothing there. Likewise every recorded_at here stays in 2025: the
-- fuel-price-comparison report tests (fuelTaxAndReport.test.ts) scan the
-- *whole* current year unscoped by member, so anything dated in 2026 would
-- inflate their row counts.

-- ─── Oil canister inventory ────────────────────────────────────────────────
INSERT INTO liquid.oil_canister (
    canister_id, club_canister_ref, batch_number, manufacturing_date,
    make, model_viscosity, aircraft_registration,
    initial_litres, remaining_litres, is_opened, opened_at, is_empty,
    created_by, updated_by
)
VALUES
    ('b1000000-0000-0000-0000-000000000001', 'MIK AS25/01', 'AS-2025-014', '2025-09-01',
     'Aeroshell', 'Aeroshell 15W50', 'OH-STL',
     5.0, 3.5, TRUE, '2025-10-15 09:00:00+00', FALSE,
     'Liisa1', 'Liisa1'),
    ('b1000000-0000-0000-0000-000000000002', 'MIK AS25/02', 'AS-2025-014', '2025-09-01',
     'Aeroshell', 'Aeroshell 100 Plus', 'OH-IHQ',
     5.0, 4.0, TRUE, '2025-10-20 09:00:00+00', FALSE,
     'Liisa1', 'Liisa1'),
    -- Unopened spare, so the inventory list also shows a not-yet-in-use canister.
    ('b1000000-0000-0000-0000-000000000003', 'MIK AS25/03', 'AS-2025-015', '2025-11-01',
     'Aeroshell', 'Aeroshell 100 Plus', 'OH-IHQ',
     5.0, NULL, FALSE, NULL, FALSE,
     'Liisa1', 'Liisa1');

-- ─── Oil records ────────────────────────────────────────────────────────────
INSERT INTO liquid.record (
    record_id, liquid_type, aircraft_registration, member_id, recorded_at,
    oil_source, oil_canister_id, remaining_litres,
    quantity_litres, flight_log_id, source, created_by, updated_by
)
VALUES
    -- Drawn from club inventory, no flight tied to it.
    ('c1000000-0000-0000-0000-000000000001', 'OIL', 'OH-STL', 'Kaisa1', '2025-11-20 10:00:00+00',
     'CANISTER', 'b1000000-0000-0000-0000-000000000001', 2.5,
     1.0, NULL, 'MANUAL', 'Kaisa1', 'Kaisa1'),
    -- Drawn from club inventory and linked to a flight log that is no longer
    -- NEW — shows the record as locked (LINKED_TO_VALIDATED_FLIGHT_LOG).
    ('c1000000-0000-0000-0000-000000000002', 'OIL', 'OH-IHQ', 'Jukka1', '2025-11-21 08:00:00+00',
     'CANISTER', 'b1000000-0000-0000-0000-000000000002', 3.5,
     0.5, 'efnu4evr', 'FLIGHT_LOG', 'Jukka1', 'Jukka1');

INSERT INTO liquid.record (
    record_id, liquid_type, aircraft_registration, member_id, recorded_at,
    oil_source, oil_make, oil_model_viscosity, oil_batch_number,
    quantity_litres, source, created_by, updated_by
)
VALUES
    -- Bought elsewhere, not out of club inventory.
    ('c1000000-0000-0000-0000-000000000003', 'OIL', 'OH-IHQ', 'Anna1', '2025-11-18 12:00:00+00',
     'OTHER', 'Aeroshell', '15W50', 'EXT-2025-07',
     1.0, 'MANUAL', 'Anna1', 'Anna1');

-- ─── Fuel records: home base (EFNU), invoiced directly, no cost to enter ───
INSERT INTO liquid.record (
    record_id, liquid_type, aircraft_registration, member_id, recorded_at,
    airport, fuel_type, provider_id, quantity_litres,
    flight_log_id, source, created_by, updated_by
)
VALUES
    -- Linked to a flight still in NEW status, so it's shown as editable.
    ('c1000000-0000-0000-0000-000000000010', 'FUEL', 'OH-STL', 'Kaisa1', '2025-11-19 09:00:00+00',
     'EFNU', 'JET A-1', 3, 45.2,
     'mass199', 'FLIGHT_LOG', 'Kaisa1', 'Kaisa1'),
    ('c1000000-0000-0000-0000-000000000011', 'FUEL', 'OH-IHQ', 'Jukka1', '2025-11-17 09:00:00+00',
     'EFNU', '100LL', 2, 30,
     NULL, 'MANUAL', 'Jukka1', 'Jukka1'),
    ('c1000000-0000-0000-0000-000000000012', 'FUEL', 'OH-IHQ', 'Anna1', '2025-11-16 09:00:00+00',
     'EFNU', 'MOGAS 98E5', 1, 25,
     NULL, 'MANUAL', 'Anna1', 'Anna1');

-- ─── Fuel records: away from home base, different provider kinds ───────────
INSERT INTO liquid.record (
    record_id, liquid_type, aircraft_registration, member_id, recorded_at,
    airport, fuel_type, provider_id, quantity_litres, total_cost, ccy, fx_rate,
    tax_included_abroad, source, created_by, updated_by
)
VALUES
    -- AirBP, EUR, unclaimed.
    ('c1000000-0000-0000-0000-000000000020', 'FUEL', 'OH-STL', 'Kaisa1', '2025-11-10 15:00:00+00',
     'EEPU', 'JET A-1', 4, 50, 165.00, 'EUR', NULL,
     TRUE, 'MANUAL', 'Kaisa1', 'Kaisa1'),
    -- AirBP again, this time paid in USD — exercises ccy/fxRate.
    ('c1000000-0000-0000-0000-000000000021', 'FUEL', 'OH-STL', 'Kaisa1', '2025-11-05 15:00:00+00',
     'EEPU', 'JET A-1', 4, 42, 180.00, 'USD', 1.08,
     TRUE, 'MANUAL', 'Kaisa1', 'Kaisa1');

-- ─── Expense claims built from selected fuel records (#1107) ───────────────
-- Claim 1: Kanair fuel abroad at Pärnu.
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at,
    fuel_litres, fuel_type, refuel_outside_finland
)
VALUES (
    'd1000000-0000-0000-0000-000000000001', 'Anna1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-STL', 'Fuel Pärnu (Kanair)', '2025-12-01', 'EUR',
    'FI4412345600000099', 'Anna Lahtinen', 'SUBMITTED', '2025-12-01 12:00:00',
    40, 'JET A-1', TRUE
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, total_cost, fuel_type,
    cost_centre_code, fuel_date, airport, sort_order
)
VALUES (
    'd1000000-0000-0000-0000-000000000001', '40 l JET A-1 · EEPU · Kanair',
    40, 'l', 3.46, 138.40, 'JET A-1', 'OH-STL', '2025-12-01', 'EEPU', 0
);

-- Claim 2: own-payment 100LL fuel at Turku.
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at,
    fuel_litres, fuel_type, refuel_outside_finland
)
VALUES (
    'd1000000-0000-0000-0000-000000000002', 'Jukka1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-IHQ', 'Fuel Turku (own payment)', '2025-12-03', 'EUR',
    'FI3312345600000012', 'Jukka Nieminen', 'SUBMITTED', '2025-12-03 09:00:00',
    35, '100LL', FALSE
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, total_cost, fuel_type,
    cost_centre_code, fuel_date, airport, sort_order
)
VALUES (
    'd1000000-0000-0000-0000-000000000002', '35 l 100LL · EFTU · Other / own payment',
    35, 'l', 2.55, 89.25, '100LL', 'OH-IHQ', '2025-12-03', 'EFTU', 0
);

-- The two claimed fuel records themselves, already linked and price-frozen —
-- matching what linkRecordsToClaim does when a member claims from the UI.
INSERT INTO liquid.record (
    record_id, liquid_type, aircraft_registration, member_id, recorded_at,
    airport, fuel_type, provider_id, quantity_litres, total_cost, ccy,
    tax_included_abroad, source,
    expense_claim_id, claim_linked_at,
    original_paid_total, original_price_per_litre, tax_adjusted_price_per_litre,
    fuel_tax_year, fuel_tax_rate_applied,
    created_by, updated_by
)
VALUES
    -- Kanair, EEPU — claimed onto claim 1.
    ('c1000000-0000-0000-0000-000000000022', 'FUEL', 'OH-STL', 'Anna1', '2025-11-30 11:00:00+00',
     'EEPU', 'JET A-1', 5, 40, 138.40, 'EUR',
     TRUE, 'MANUAL',
     'd1000000-0000-0000-0000-000000000001', '2025-12-01 12:00:00+00',
     138.40, 3.46, 3.46,
     2025, 0,
     'Anna1', 'Anna1'),
    -- Own payment, EFTU — claimed onto claim 2.
    ('c1000000-0000-0000-0000-000000000023', 'FUEL', 'OH-IHQ', 'Jukka1', '2025-12-02 08:00:00+00',
     'EFTU', '100LL', 6, 35, 89.25, 'EUR',
     FALSE, 'MANUAL',
     'd1000000-0000-0000-0000-000000000002', '2025-12-03 09:00:00+00',
     89.25, 2.55, 2.30,
     2025, 0.0956,
     'Jukka1', 'Jukka1');
