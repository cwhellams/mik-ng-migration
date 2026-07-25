-- V20__AircraftData.sql references columns that no longer exist on
-- flight.aircraft: last_maintenance_tach/next_maintenance_tach were renamed
-- to *_mins by V780__UpdateAircraftTachHoursToMinutes.sql, usable_percentage_hours
-- was renamed to reserved_hours by V620__AlterAircraftReseredHoursField.sql, and
-- hourly_rate_eur was dropped by V780 (pricing now lives in accts.aircraft_pricing,
-- seeded by V440__InsertInitialAircraftPricing.sql). This makes V20 fail with
-- "column does not exist" on any environment applying static data from scratch
-- after those schema migrations.
--
-- V20 itself is left untouched (already applied/checksummed wherever static data
-- has run before), per policy against editing deployed migration files. This file
-- re-inserts the same three aircraft using the current column names/values, as a
-- no-op (ON CONFLICT DO NOTHING) wherever they already exist — which is everywhere
-- today, since OH-STL/OH-IHQ are also guaranteed by the schema migration
-- V435__Add aircraft if not present.sql — and otherwise provides the missing data.
INSERT INTO flight.aircraft (
        registration,
        display_name,
        model,
        manufacturer,
        year_of_manufacture,
        seats,
        usable_fuel_litres,
        fuel_types,
        active,
        maintenance_cycle,
        last_maintenance_date,
        last_maintenance_type,
        last_maintenance_mins,
        next_maintenance_date,
        next_maintenance_type,
        next_maintenance_mins,
        total_percentage_hours,
        reserved_hours,
        location,
        notes,
        equipment,
        created_at,
        updated_at,
        created_by,
        updated_by,
        image_url
    )
VALUES (
        'OH-STL',
        'Diamond DA40',
        'DA40',
        'Diamond Aircraft',
        2007,
        4,
        147.6,
        ARRAY ['JETA-1'],
        TRUE,
        100,
        '2024-11-10',
        '200h',
        4709 * 60,
        null,
        '100h',
        4778 * 60,
        10,
        8,
        'EFNU BF-hangar 21',
        to_jsonb(
            ARRAY [
            jsonb_object(ARRAY['text', 'severity'],
            ARRAY ['Keep oil quantity level in the middle of the approved range - do not add to full!', 'note']
        ) ]
    ),
    'SDFGY/S',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'k1mnimda',
    'k1mnimda',
    'https://www.flyfinland.fi/photos/original/29416.jpg'
),
(
    'OH-IHQ',
    'Diamond DV20',
    'DV20',
    'Diamond Aircraft',
    2010,
    2,
    77,
    ARRAY ['AVGAS', 'MOGAS'],
    TRUE,
    50,
    '2025-03-01',
    '200h',
    6085 * 60,
    null,
    '50h',
    6130 * 60,
    5,
    3,
    'EFNU Cumulus Hangar',
    to_jsonb(
        ARRAY [
        jsonb_object(ARRAY['text', 'severity'],
        ARRAY ['Koneen palosammutin on huollossa. Ei ole pakollinen varuste, mutta huomioitava!', 'caution']
    ) ]
),
'VOY/S',
CURRENT_TIMESTAMP,
CURRENT_TIMESTAMP,
'k1mnimda',
'k1mnimda',
'https://cdn.jetphotos.com/full/5/69415_1600241420.jpg'
),
(
    'OH-P28',
    'Piper PA-28',
    'PA-28',
    'Piper Aircraft',
    2005,
    4,
    181.5,
    ARRAY ['AVGAS'],
    FALSE,
    50,
    '2024-04-15',
    '50h',
    5180 * 60,
    '2025-05-05',
    '50h',
    5230 * 60,
    5,
    3,
    'EFNU',
    to_jsonb(
        ARRAY [
        jsonb_object(ARRAY['text', 'severity'],
        ARRAY ['Waiting for annual', 'warning']
    ) ]
),
'SFD',
CURRENT_TIMESTAMP,
CURRENT_TIMESTAMP,
'k1mnimda',
'k1mnimda',
'https://cdn.jetphotos.com/full/6/927368_1715977239.jpg'
) ON CONFLICT (registration) DO NOTHING;
