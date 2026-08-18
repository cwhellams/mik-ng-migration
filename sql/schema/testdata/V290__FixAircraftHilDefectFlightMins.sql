-- ============================================================
-- V290__FixAircraftHilDefectFlightMins
--
-- The five HIL-linked defects seeded in V270/V280 used low flight_mins
-- values (matching roughly when each defect would have been found), but
-- OH-STL/1, OH-IHQ/2 and OH-P28/4's live baselines (from FlightLogMassData/
-- LandingBaselineData) already sit far above those values, so the defects
-- never appeared as live rows on the current logbook page
-- (flight.vw_ajlb_live_sequence only includes items at or after each
-- aircraft/ajlb's baseline -- see V1700). This corrects them to sit just
-- past each baseline (OH-STL/1's 21301, OH-IHQ/2's 367120, OH-P28/4's
-- 313810) via UPDATE, so the already-applied V270/V280 files don't need to
-- be edited in place.
-- ============================================================

UPDATE flight.defect SET flight_mins = 21310
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000001';

UPDATE flight.defect SET flight_mins = 21320
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000002';

UPDATE flight.defect SET flight_mins = 367130
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000003';

UPDATE flight.defect SET flight_mins = 21330
    WHERE hil_id = '0195c1a0-0000-4000-8000-000000000004';

UPDATE flight.defect SET flight_mins = 313820
    WHERE aircraft_registration = 'OH-P28' AND ajlb_seq_no = 4
        AND description = 'Oil seepage noticed around the cowling';
