-- ============================================================
-- V270__AircraftHilTestData
--
-- Test data for exercising the Hold Item List (HIL) on the
-- aircraft details page (issue #193):
--   * OH-STL: one hold item within its due date and one that has
--     been extended once, each with its own deferred logbook defect
--     so the HIL <-> flight log links can be followed both ways.
--   * OH-IHQ: an overdue hold item with its own deferred defect,
--     which grounds the aircraft.
--   * OH-P28: an active defect with no hold item and no
--     maintenance release, which also grounds the aircraft.
-- ============================================================

INSERT INTO flight.aircraft_hil (
        hil_id, aircraft_registration, hil_number, source_ref, defect_cat,
        description, restrictions, open_date, name, due_date,
        created_by, updated_by
    )
VALUES (
        '0195c1a0-0000-4000-8000-000000000001', 'OH-STL', 1,
        'OH-STL journey log book 1', 'B',
        'Landing light inoperative',
        'Day VFR only. No night flight.',
        NOW() - INTERVAL '10 days', 'Matti Virtanen', NOW() + INTERVAL '80 days',
        'Matti1', 'Matti1'
    ),
    (
        '0195c1a0-0000-4000-8000-000000000002', 'OH-STL', 2,
        'OH-STL journey log book 1', 'C',
        'ADF unserviceable',
        'IFR flight prohibited. No flight on routes requiring NDB navigation.',
        NOW() - INTERVAL '200 days', 'Matti Virtanen', NOW() - INTERVAL '80 days',
        'Matti1', 'Matti1'
    ),
    (
        '0195c1a0-0000-4000-8000-000000000003', 'OH-IHQ', 1,
        'OH-IHQ journey log book 2', 'B',
        'Right main tyre wear close to limit',
        'No operations from unpaved runways.',
        NOW() - INTERVAL '120 days', 'Liisa Lahtinen', NOW() - INTERVAL '15 days',
        'Liisa1', 'Liisa1'
    );

-- OH-STL #2 has been extended once: the effective due date shown to pilots is
-- the extension date, which is still in the future.
INSERT INTO flight.aircraft_hil_extension (hil_id, extension_date, name, extension_due, created_by)
VALUES (
        '0195c1a0-0000-4000-8000-000000000002',
        NOW() - INTERVAL '25 days', 'Matti Virtanen', NOW() + INTERVAL '40 days', 'Matti1'
    );

-- The logbook defects deferred to each of the three hold items above, so the
-- HIL <-> flight log links can be followed both ways for all of them.
--
-- No blank_rows_after column here: V1870 (this branch) drops it from
-- flight.defect entirely, and testdata always applies against the fully
-- migrated schema, so this file can no longer reference it. (Their
-- flight_mins are bumped to sit above each aircraft/ajlb's live baseline in
-- V290 instead of here, since that part isn't schema-forced -- see V290's
-- comment.)
INSERT INTO flight.defect (
        aircraft_registration, ajlb_seq_no, flight_id, description, flight_mins,
        status, hil_id, created_by, updated_by
    )
VALUES (
        'OH-STL', 1, NULL, 'Landing light does not illuminate on pre-flight check', 1200,
        'MOVED_TO_HIL', '0195c1a0-0000-4000-8000-000000000001', 'Matti1', 'Matti1'
    ),
    (
        'OH-STL', 1, NULL, 'ADF fails to lock onto any station', 1150,
        'MOVED_TO_HIL', '0195c1a0-0000-4000-8000-000000000002', 'Matti1', 'Matti1'
    ),
    (
        'OH-IHQ', 2, NULL, 'Right main tyre worn close to limit on walkaround', 800,
        'MOVED_TO_HIL', '0195c1a0-0000-4000-8000-000000000003', 'Liisa1', 'Liisa1'
    );

-- An unaddressed defect: no hold item, no maintenance release, so OH-P28 is grounded
INSERT INTO flight.defect (
        aircraft_registration, ajlb_seq_no, flight_id, description, flight_mins,
        status, hil_id, created_by, updated_by
    )
VALUES (
        'OH-P28', 4, NULL, 'Oil seepage noticed around the cowling', 900,
        'ACTIVE', NULL, 'Liisa1', 'Liisa1'
    );
