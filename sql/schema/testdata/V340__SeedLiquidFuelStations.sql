-- ============================================================
-- Liquid Management System (#1119) — the location-dependent half of the seed
-- ============================================================
-- liquid.fuel_provider.default_airport and the liquid.fuel_station rows both
-- reference static.airfields, which is seeded by this same data phase rather
-- than by a schema migration. The schema migration (V2030) therefore creates the
-- tables and seeds everything that has no airport in it, and this fills in the
-- rest.
--
-- Kept identical in sql/schema/static_data/ and sql/schema/testdata/ because the
-- two phases seed static.airfields separately too — production from
-- static_data/V10 (all EU airfields), tests from testdata/V20 (the Finnish
-- ones). If you change one, change the other.

UPDATE liquid.fuel_provider
SET default_airport = 'EFNU',
    updated_at      = NOW(),
    updated_by      = 'system'
WHERE is_home_base = TRUE
  AND default_airport IS NULL;

-- One row per pump: a QR code stuck on a pump resolves to exactly one fuel type,
-- which is what lets a member scan it and enter only the litres.
INSERT INTO liquid.fuel_station (label, airport, fuel_type, provider_id, created_by, updated_by)
SELECT s.label, 'EFNU', s.fuel_type, p.provider_id, 'system', 'system'
FROM (VALUES
        ('EFNU MOGAS 98E5', 'MOGAS 98E5', 'MPL'),
        ('EFNU 100LL',      '100LL',      'EFNU_FUEL'),
        ('EFNU Jet A-1',    'JET A-1',    'LOKKI')
     ) AS s (label, fuel_type, provider_code)
JOIN liquid.fuel_provider p ON p.code = s.provider_code
WHERE NOT EXISTS (SELECT 1 FROM liquid.fuel_station existing WHERE existing.label = s.label);
