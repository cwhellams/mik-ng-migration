-- ============================================================
-- V390__RecordedOnBackdatedEntries
--
-- Test data for the editable journey-log-book date (issue #1254). recorded_on
-- defaults to the day the row is written, which is the only date these entries
-- could ever have had before; what the feature adds is the ability to say "this
-- happened on the 14th, I am typing it in on the 20th". So this file seeds both
-- modes side by side:
--
--   * two maintenance notes -- one entered the day the work was done, one
--     entered six days late;
--   * the existing defects backdated by a few days each, so the logbook shows a
--     column of dates that are visibly not all "today".
--
-- Placement: the notes go in OH-STL's *current* book (seq 3), which is where an
-- admin would really write them, anchored past its last flight (703744) so they
-- land on the tail of the last page (520) rather than reflowing any flight onto
-- another page -- that page has three of its five rows used, so the two notes
-- fit and no ajlb's last_page moves. The defects, seeded in V270/V280, stay
-- where V290 put them.
-- ============================================================

INSERT INTO flight.maintenance_note (
        aircraft_registration, ajlb_seq_no, description, performed_by,
        flight_mins, recorded_on, rows, created_by, updated_by
    )
VALUES (
        'OH-STL', 3,
        '50 h inspection, oil and filter changed',
        'Matti Virtanen',
        703800, CURRENT_DATE, 1,
        'Matti1', 'Matti1'
    ),
    -- The delayed entry this issue is about: the work was signed off in the
    -- paper book six days before it reached the intranet.
    (
        'OH-STL', 3,
        'Landing light bulb replaced, tested serviceable',
        'Liisa Lahtinen',
        703850, CURRENT_DATE - INTERVAL '6 days', 1,
        'Liisa1', 'Liisa1'
    );

-- Found on the ramp before the weekend, written up afterwards.
UPDATE flight.defect
    SET recorded_on = CURRENT_DATE - INTERVAL '3 days'
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000001';

UPDATE flight.defect
    SET recorded_on = CURRENT_DATE - INTERVAL '9 days'
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000002';

UPDATE flight.defect
    SET recorded_on = CURRENT_DATE - INTERVAL '2 days'
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000003';

UPDATE flight.defect
    SET recorded_on = CURRENT_DATE - INTERVAL '1 day'
    WHERE aircraft_registration = 'OH-P28' AND ajlb_seq_no = 4
        AND description = 'Oil seepage noticed around the cowling';
