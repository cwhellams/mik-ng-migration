INSERT INTO flight.aircraft (
    registration,
    display_name,
    model,
    manufacturer,
    year_of_manufacture,
    active,
    maintenance_cycle,
    last_maintenance_date,
    last_maintenance_type,
    last_maintenance_tach,
    next_maintenance_date,
    next_maintenance_type,
    next_maintenance_tach,
    total_percentage_hours,
    usable_percentage_hours,
    location,
    notes,
    equipment,
    hourly_rate_eur,
    created_at,
    updated_at,
    created_by, updated_by
) VALUES
(
    'OH-STL', 'Diamond DA40', 'DA40', 'Diamond Aircraft', 2007, TRUE, 
    100, '2024-11-10', '200', 4709, null, '100', 4778,
    10, 8, 'EFNU BF-hangar 21', 
    to_jsonb(
        ARRAY[
            jsonb_object(ARRAY['text', 'severity'], ARRAY['Keep oil quantity level in the middle of the approved range - do not add to full!', 'note'])
        ]
    ),
    'SDFGY/S', 216.00,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),

(
    'OH-IHQ', 'Diamond DV20', 'DV20', 'Diamond Aircraft', 2010, TRUE, 
    50, '2025-03-01', '200', 6085, null, '50', 6130,
    5, 3, 'EFNU Cumulus Hangar', 
    to_jsonb(ARRAY[
        jsonb_object(ARRAY['text', 'severity'], ARRAY['Koneen palosammutin on huollossa. Ei ole pakollinen varuste, mutta huomioitava!', 'caution'])
    ]),
    'VOY/S', 147.00,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),

(
    'OH-P28', 'Piper PA-28', 'PA-28', 'Piper Aircraft', 2005, FALSE, 
    50, '2024-04-15', '50', 5180.00, '2025-05-05', '50', 5230,
    5, 3, 'EFNU', 
    to_jsonb(ARRAY[
        jsonb_object(ARRAY['text', 'severity'], ARRAY['Waiting for annual', 'warning'])
    ]),
    'SFD', 228.00,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
);