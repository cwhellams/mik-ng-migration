-- ============================================================
-- V280__AircraftHilOptionalFieldsTestData
--
-- Issue #1120 made defect category, source ref and due date
-- optional on a hold item. This adds an OH-STL hold item with
-- all three left empty, so the empty states are visible in
-- local dev: no category chip, no source ref, a "no due date"
-- placeholder, and no extension button (nothing to extend).
--
-- It must not ground the aircraft: with no due date it can
-- never be past due.
-- ============================================================

INSERT INTO flight.aircraft_hil (
        hil_id, aircraft_registration, hil_number, source_ref, defect_cat,
        description, restrictions, open_date, name, due_date,
        created_by, updated_by
    )
VALUES (
        '0195c1a0-0000-4000-8000-000000000004', 'OH-STL', 3,
        NULL, NULL,
        'Cabin heat control stiff to operate',
        NULL,
        NOW() - INTERVAL '5 days', 'Matti Virtanen', NULL,
        'Matti1', 'Matti1'
    );

INSERT INTO flight.defect (
        aircraft_registration, ajlb_seq_no, flight_id, description, flight_mins,
        status, hil_id, created_by, updated_by
    )
VALUES (
        'OH-STL', 1, NULL, 'Cabin heat control very stiff, hard to move in flight', 1100,
        'MOVED_TO_HIL', '0195c1a0-0000-4000-8000-000000000004', 'Matti1', 'Matti1'
    );
