-- ============================================================
-- Non-fixed-base fuel stations: Kanair and Other, stuck on the plane (#1119 follow-up)
-- ============================================================
-- V350 seeded the three EFNU pumps, each fixed to an airport and a grade.
-- These four are the opposite shape, enabled by V2170: no airport (Kanair
-- fuels wherever the plane lands, not at a fixed base) and, for OH-IHQ, no
-- fixed grade either (Kanair sells 100LL and MOGAS both, and the member picks
-- which one they actually took). One row per aircraft rather than one shared
-- row, because the QR sticker goes on the airframe -- MIK operates exactly
-- two powered aircraft, OH-STL (Jet A-1 only) and OH-IHQ (100LL/MOGAS).
--
-- The "Other" pair covers a purchase from neither a fixed EFNU pump nor
-- Kanair: airport, fuel type and cost are all left for the member to fill in,
-- same as reporting by hand, but scanning still saves them picking the
-- aircraft and the provider.
--
-- Kept identical in sql/schema/static_data/ and sql/schema/testdata/, same as
-- V350/V30 -- see the note there.

INSERT INTO liquid.fuel_station (label, airport, fuel_type, provider_id, aircraft_registration, created_by, updated_by)
SELECT s.label, NULL, s.fuel_type, p.provider_id, s.aircraft_registration, 'system', 'system'
FROM (VALUES
        ('OH-STL Kanair JET A-1', 'OH-STL', 'JET A-1', 'KANAIR'),
        ('OH-IHQ Kanair',         'OH-IHQ', NULL,       'KANAIR'),
        ('OH-STL Other',          'OH-STL', NULL,       'OTHER'),
        ('OH-IHQ Other',          'OH-IHQ', NULL,       'OTHER')
     ) AS s (label, aircraft_registration, fuel_type, provider_code)
JOIN liquid.fuel_provider p ON p.code = s.provider_code
WHERE NOT EXISTS (SELECT 1 FROM liquid.fuel_station existing WHERE existing.label = s.label);
