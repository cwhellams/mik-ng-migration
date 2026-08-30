-- ============================================================
-- V450__FindingSearchTestData
--
-- Seed data for the defect/remark search and monitoring tool
-- (issue #1230), so the feature can be clicked through in
-- `pnpm dev` rather than only exercised by the test suite.
--
-- It covers the four things the tool has to get right:
--
--   * The issue's own example -- two remarks about fuel
--     increasing in OH-STL's right tank, worded differently, a
--     few weeks apart. This is the cluster "trending" exists to
--     surface, and it is deliberately size 2, because the
--     answer on the issue was to flag at two reports, not three.
--   * A second, larger pattern on the same aircraft (nose wheel
--     shimmy) reported three times, so a cluster bigger than the
--     minimum is visible too.
--   * A cluster that spans both kinds: a remark about the landing
--     light, worded like the landing-light defect V270 already
--     puts on OH-STL. Built out of an existing defect rather than
--     a new one on purpose -- see the note below.
--   * The same fuel wording on a *different* aircraft (OH-IHQ),
--     which must never join OH-STL's cluster. Similarity is
--     scoped per aircraft, and this row is what shows that on
--     screen.
--
-- Plus a handful of unrelated singletons, so the search's
-- filters have something to filter and the "0 similar" case is
-- the common one it should be.
--
-- created_at is set relative to NOW() on every row: the search
-- sorts and filters on it, and the trending window looks back a
-- year, so fixed dates would age out of the default view.
-- ============================================================

-- --- OH-STL: the fuel pattern from the issue ---------------------------------
INSERT INTO flight.remark (remark_id, flight_id, description, created_at, created_by, updated_at, updated_by)
VALUES (
        '0195c1a0-1230-4000-8000-000000000001', 'pob26b04',
        'Fuel appears to be increasing in the right tank during the flight',
        NOW() - INTERVAL '62 days', 'Matti1', NOW() - INTERVAL '62 days', 'Matti1'
    ),
    (
        '0195c1a0-1230-4000-8000-000000000002', 'eff1fl',
        'Right tank fuel quantity increasing again, left tank steady',
        NOW() - INTERVAL '20 days', 'Liisa1', NOW() - INTERVAL '20 days', 'Liisa1'
    );

-- --- OH-STL: a three-report pattern that spans both kinds ---------------------
INSERT INTO flight.remark (remark_id, flight_id, description, created_at, created_by, updated_at, updated_by)
VALUES (
        '0195c1a0-1230-4000-8000-000000000003', 'pob26c03',
        'Nose wheel shimmy on landing roll, mild',
        NOW() - INTERVAL '75 days', 'Liisa1', NOW() - INTERVAL '75 days', 'Liisa1'
    ),
    (
        '0195c1a0-1230-4000-8000-000000000004', 'pob26c04',
        'Nosewheel shimmy during the landing roll again',
        NOW() - INTERVAL '46 days', 'Matti1', NOW() - INTERVAL '46 days', 'Matti1'
    );

INSERT INTO flight.remark (remark_id, flight_id, description, created_at, created_by, updated_at, updated_by)
VALUES (
        '0195c1a0-1230-4000-8000-000000000005', 'eff2fl',
        'Nose wheel shimmy on the landing roll, worse than last time',
        NOW() - INTERVAL '11 days', 'Matti1', NOW() - INTERVAL '11 days', 'Matti1'
    );

-- --- OH-STL: a cluster that spans both kinds ---------------------------------
-- Deliberately built from the landing-light *defect* V270 already seeds rather
-- than from a new one. A defect is not inert test data: an ACTIVE one grounds
-- the aircraft, and any defect occupies rows on its journey log book page, so
-- adding one here moves `isGrounded` on the HIL overview and the computed last
-- page in the AJLB snapshots. Pairing a remark with an existing defect shows
-- the same cross-kind cluster and leaves the fleet's state alone.
INSERT INTO flight.remark (remark_id, flight_id, description, created_at, created_by, updated_at, updated_by)
VALUES (
        '0195c1a0-1230-4000-8000-000000000010', 'eff4fl',
        'Landing light did not illuminate on the pre-flight check again',
        NOW() - INTERVAL '3 days', 'Liisa1', NOW() - INTERVAL '3 days', 'Liisa1'
    );

-- --- OH-IHQ: the same fuel wording on another aircraft ------------------------
-- Must not be pulled into OH-STL's cluster. A shared phrase across two tail
-- numbers is two aeroplanes with the same symptom, not one pattern.
INSERT INTO flight.remark (remark_id, flight_id, description, created_at, created_by, updated_at, updated_by)
VALUES (
        '0195c1a0-1230-4000-8000-000000000006', 'ihq3fn2',
        'Fuel increasing in the right tank on this flight as well',
        NOW() - INTERVAL '35 days', 'Liisa1', NOW() - INTERVAL '35 days', 'Liisa1'
    );

-- --- Unrelated singletons, so "0 similar" is the ordinary case ----------------
INSERT INTO flight.remark (remark_id, flight_id, description, created_at, created_by, updated_at, updated_by)
VALUES (
        '0195c1a0-1230-4000-8000-000000000007', 'eff2fl',
        'Pilot seat rail catch stiff, needs a firm push to lock',
        NOW() - INTERVAL '15 days', 'Matti1', NOW() - INTERVAL '15 days', 'Matti1'
    ),
    (
        '0195c1a0-1230-4000-8000-000000000008', 'eff4fl',
        'Cabin door seal whistles above 100 kt',
        NOW() - INTERVAL '5 days', 'Liisa1', NOW() - INTERVAL '5 days', 'Liisa1'
    ),
    (
        '0195c1a0-1230-4000-8000-000000000009', 'te1nr01a',
        'Kompassin valo himmeä yöllä',
        NOW() - INTERVAL '140 days', 'Liisa1', NOW() - INTERVAL '140 days', 'Liisa1'
    );
