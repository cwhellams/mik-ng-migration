
INSERT INTO flight.aircraft_documents (
    registration,
    document_id,
    start_date,
    end_date,
    alert_days_before,
    soft_limit,
    hard_limit,
    created_at,
    updated_at,
    created_by,
    updated_by
) VALUES
(
    'OH-STL', 'radio',
    '2024-09-01', '2025-08-31',
    14, null, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-STL', 'arc',
    '2024-03-16', '2026-03-15',
    14, null, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-STL', 'insurance',
    '2024-06-07', '2025-06-06',
    14, null, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-STL', 'finavia',
    '2025-01-01', '2025-12-31',
    14, 0, null, 
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-IHQ', 'radio',
    '2024-09-01', '2025-08-31',
    14, null, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-IHQ', 'arc',
    '2025-05-05', '2026-05-04',
    14, null, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-IHQ', 'insurance',
    '2024-06-07', '2025-06-06',
    14, null, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
),
(
    'OH-IHQ', 'finavia',
    '2025-01-01', '2025-12-31',
    14, 0, null,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'k1mnimda', 'k1mnimda'
);
