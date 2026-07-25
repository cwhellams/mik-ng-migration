-- Expense claims test data, including fuel claims with an airport + date on
-- each line item, so the "recent fuelings by outstation" report (issue #966)
-- has something to show in local/dev environments.

-- Fuel claim 1: Matti1, OH-STL, submitted, fuelled at home base EFNU.
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at
)
VALUES (
    'a1000000-0000-0000-0000-000000000001', 'Matti1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-STL', 'Fuel EFNU', '2026-05-03', 'EUR',
    'FI2112345600000785', 'Matti Virtanen', 'SUBMITTED', '2026-05-03 18:00:00'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, fuel_type, cost_centre_code,
    fuel_date, airport, sort_order
)
VALUES (
    'a1000000-0000-0000-0000-000000000001', '60.26 l JetA1 at EFNU',
    60.26, 'l', 1.2473, 'JetA1', 'OH-STL', '2026-05-03', 'EFNU', 0
);

-- Fuel claim 2: Matti1, OH-IHQ, approved, fuelled at Turku (EFTU).
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at, approved_at, approved_by
)
VALUES (
    'a1000000-0000-0000-0000-000000000002', 'Matti1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-IHQ', 'Fuel Turku', '2026-06-10', 'EUR',
    'FI2112345600000785', 'Matti Virtanen', 'APPROVED',
    '2026-06-10 17:00:00', '2026-06-11 09:00:00', 'Liisa1'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, fuel_type, cost_centre_code,
    fuel_date, airport, sort_order
)
VALUES (
    'a1000000-0000-0000-0000-000000000002', '45.5 l 100LL at Turku',
    45.5, 'l', 2.3499, '100LL', 'OH-IHQ', '2026-06-10', 'EFTU', 0
);

-- Fuel claim 3: Jukka1, OH-STL, submitted (awaiting approval), fuelled at Pori (EFPO).
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at
)
VALUES (
    'a1000000-0000-0000-0000-000000000003', 'Jukka1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-STL', 'Fuel Pori', '2026-06-20', 'EUR',
    'FI3312345600000012', 'Jukka Nieminen', 'SUBMITTED', '2026-06-20 16:30:00'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, fuel_type, cost_centre_code,
    fuel_date, airport, sort_order
)
VALUES (
    'a1000000-0000-0000-0000-000000000003', '50 l JetA1 at Pori',
    50, 'l', 1.298, 'JetA1', 'OH-STL', '2026-06-20', 'EFPO', 0
);

-- Fuel claim 4: Anna1, OH-IHQ, approved, fuelled at Helsinki-Vantaa (EFHK).
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at, approved_at, approved_by
)
VALUES (
    'a1000000-0000-0000-0000-000000000004', 'Anna1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-IHQ', 'Fuel Helsinki-Vantaa', '2026-06-28', 'EUR',
    'FI4412345600000099', 'Anna Lahtinen', 'APPROVED',
    '2026-06-28 12:00:00', '2026-06-29 08:30:00', 'Liisa1'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, fuel_type, cost_centre_code,
    fuel_date, airport, sort_order
)
VALUES (
    'a1000000-0000-0000-0000-000000000004', '40 l 100LL at Helsinki-Vantaa',
    40, 'l', 2.55, '100LL', 'OH-IHQ', '2026-06-28', 'EFHK', 0
);

-- Fuel claim 5: Pekka1, OH-STL, synced (fully processed), fuelled at Tampere-Pirkkala (EFTP).
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at, approved_at, approved_by
)
VALUES (
    'a1000000-0000-0000-0000-000000000005', 'Pekka1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-STL', 'Fuel Tampere-Pirkkala', '2026-04-15', 'EUR',
    'FI5512345600000034', 'Pekka Mäkinen', 'SYNCED',
    '2026-04-15 15:00:00', '2026-04-16 08:00:00', 'Liisa1'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, fuel_type, cost_centre_code,
    fuel_date, airport, sort_order
)
VALUES (
    'a1000000-0000-0000-0000-000000000005', '55 l JetA1 at Tampere-Pirkkala',
    55, 'l', 1.276, 'JetA1', 'OH-STL', '2026-04-15', 'EFTP', 0
);

-- Fuel claim 6: Matti1, still a draft — no airport/date yet (older data entered
-- before this field existed), demonstrates that incomplete fuel lines are
-- simply excluded from the recent-fuelings report rather than erroring.
INSERT INTO accts.expense_claim (
    id, member_id, category_id, aircraft_id, title, expense_date, ccy, status
)
VALUES (
    'a1000000-0000-0000-0000-000000000006', 'Matti1',
    (SELECT id FROM accts.expense_category WHERE code = 'fuel'),
    'OH-STL', 'Fuel draft (incomplete)', '2026-07-01', 'EUR', 'DRAFT'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, fuel_type, cost_centre_code,
    sort_order
)
VALUES (
    'a1000000-0000-0000-0000-000000000006', '30 l JetA1, airport not recorded',
    30, 'l', 1.30, 'JetA1', 'OH-STL', 0
);

-- Misc claim: Matti1, submitted, to populate the general expenses list too.
INSERT INTO accts.expense_claim (
    id, member_id, category_id, title, expense_date, ccy,
    iban, iban_account_name, status, submitted_at
)
VALUES (
    'a2000000-0000-0000-0000-000000000001', 'Matti1',
    (SELECT id FROM accts.expense_category WHERE code = 'misc'),
    'Parking at EFTU', '2026-06-11', 'EUR',
    'FI2112345600000785', 'Matti Virtanen', 'SUBMITTED', '2026-06-11 10:00:00'
);

INSERT INTO accts.expense_claim_line_item (
    claim_id, description, quantity, unit, unit_price, sort_order
)
VALUES (
    'a2000000-0000-0000-0000-000000000001', 'Parking fee', 1, 'pcs', 12.5, 0
);
