-- ============================================================
-- V410__MaintenanceNoteFrozenPositionTestData
--
-- Test data for the two states an own-row maintenance note can be in now that
-- its logbook position can be frozen (issue #1267). Until now there were no
-- maintenance notes in the test data at all, so neither state was clickable in
-- a running app.
--
--   * FROZEN, on OH-IHQ journey log book 3 (start_page 600, rows_per_page 5,
--     all three of its flights validated, the last one written onto page 602
--     row 3). This note was recorded right after that flight (flight_mins =
--     its ajlb_total_flight_mins) and frozen onto the next row when it was
--     validated. It is the note that used to disappear: validate one more
--     flight and the old live view stopped returning it, because it was behind
--     the baseline and materialised nowhere. Now it is materialised here, and
--     its row is fixed for good.
--
--   * LIVE, on OH-P28 journey log book 10 (start_page 200, rows_per_page 5),
--     recorded after that logbook's one unvalidated flight and not yet frozen,
--     so it still reflows: flight.vw_ajlb_live_sequence places it on the first
--     free row after that flight and would move it again if an earlier flight
--     were logged.
--
-- Both are placed on a row that leaves each logbook's last_page and
-- new_flights_page exactly where they already were, so this seed can't quietly
-- reshuffle every other logbook expectation. The live one deliberately sits in
-- a logbook no test validates flights in, and past that logbook's last flight
-- time, so a test run can never freeze it and leave it frozen for the next one.
-- ============================================================

INSERT INTO flight.maintenance_note (
        note_id, aircraft_registration, ajlb_seq_no, description, performed_by,
        flight_mins, rows, ajlb_page_number, ajlb_row_number,
        created_by, updated_by
    )
VALUES (
        '0195c1a0-1267-4000-8000-000000000001', 'OH-IHQ', 3,
        'Vuosihuolto suoritettu, huoltotodiste 2025-05-03',
        'Matti Virtanen',
        800180, 1, 602, 4,
        'Matti1', 'Matti1'
    ),
    (
        '0195c1a0-1267-4000-8000-000000000002', 'OH-P28', 10,
        'Öljynvaihto ja suodattimen tarkastus',
        'Liisa Lahtinen',
        290250, 1, NULL, NULL,
        'Liisa1', 'Liisa1'
    );
