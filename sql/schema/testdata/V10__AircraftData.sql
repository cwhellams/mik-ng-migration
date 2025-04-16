INSERT INTO flight.aircraft (
    registration,
    display_name,
    model,
    manufacturer,
    year_of_manufacture,
    total_hours,
    engine_tbo_hours,
    prop_tbo_hours,
    hours_at_last_engine_overhaul,
    hours_at_last_prop_overhaul,
    last_annual,
    next_annual,
    last_100hr,
    last_50hr,
    last_100hr_tach,
    last_50hr_tach,
    insurance_cert_expiry,
    radio_cert_expiry,
    transponder_cert_expiry,
    elt_cert_expiry,
    gps_cert_expiry,
    harness_expiry,
    equipment,
    hourly_rate_eur,
    created_at,
    updated_at,
    created_by, updated_by
) VALUES
(
    'OH-STL', 'Diamond DA40', 'DA40', 'Diamond Aircraft', 2015, 3200.50,
    2000, 2400, 1500.00, 1800.00,
    '2024-01-15', '2025-01-15', '2024-02-10', '2024-03-05', 3100.00, 3150.00,
    '2024-12-31', '2025-06-30', '2025-01-01', '2025-02-01',
    '2025-03-15', '2026-01-01', 'SFDY', 180.00,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),

(
    'OH-IHQ', 'Diamond DV20', 'DV20', 'Diamond Aircraft', 2010, 4100.75,
    2400, 2000, 2000.50, 2100.25,
    '2024-02-20', '2025-02-20', '2024-03-01', '2024-04-10', 4000.00, 4050.00,
    '2024-11-30', '2025-05-31', '2024-12-01', '2025-01-15',
    '2025-06-20', '2026-03-10', 'SF', 160.00,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),

(
    'OH-P28', 'Piper PA-28', 'PA-28', 'Piper Aircraft', 2005, 5200.30,
    2000, 2400, 3000.00, 3100.00,
    '2024-03-10', '2025-03-10', '2024-04-15', '2024-05-20', 5150.00, 5180.00,
    '2025-07-01', '2025-12-15', '2026-02-01', '2026-03-10',
    '2025-08-20', '2026-04-01', 'SFD', 140.00,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
);
