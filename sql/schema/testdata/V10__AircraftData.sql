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
        5180*60,
        '2025-05-05',
        '50h',
        5230*60,
        5,
        2,
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

-- Fix test data after V620__AlterAircraftReseredHoursField.sql
UPDATE flight.aircraft
SET reserved_hours = total_percentage_hours - reserved_hours
WHERE registration = 'OH-STL' OR registration = 'OH-IHQ';