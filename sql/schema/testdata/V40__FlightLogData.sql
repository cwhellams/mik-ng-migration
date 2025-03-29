-- Insert test data for the flight.logs table
INSERT INTO flight.logs (
    billable_member_id,
    captain_member_id,
    captain,
    copilot_member_id,
    copilot,
    aircraft_registration,
    on_block_time_utc,
    off_block_time_utc,
    takeoff_time_utc,
    landing_time_utc,
    oil_uplift_litres,
    fuel_uplift_litres,
    persons_on_board,
    number_of_landings,
    night_hours,
    instrument_hours,
    departure_airport,
    arrival_airport,
    invoice_number,
    flight_type,
    billing_remarks,
    remarks,
    created_by,
    updated_by,
    is_billable_flight,
    non_billing_reason,
    non_billing_approved_by_member_id
) VALUES
(
    1, 6, 'Virtanen', 7, 'Nieminen', 'OH-STL',
    '2025-03-01 08:00:00+00', '2025-03-01 08:15:00+00',
    '2025-03-01 08:30:00+00', '2025-03-01 10:00:00+00',
    1.5, 50.0, 4, 1, '00:30:00', '00:45:00', 'EFHK', 'EFHK',
    'INV001', 'KOU', 'N/A', 'Smooth flight',
    10, 10, TRUE, NULL, NULL
),
(
    3, 8, 'Lahtinen', 9, 'Koskinen', 'OH-IHQ',
    '2025-03-02 09:00:00+00', '2025-03-02 09:10:00+00',
    '2025-03-02 09:20:00+00', '2025-03-02 11:00:00+00',
    2.0, 60.0, 2, 2, '00:45:00', '01:00:00', 'EFHK', 'EFTP',
    'INV002', 'MAT', 'N/A', 'Training flight',
    9, 9, TRUE, NULL, NULL
),
(
    4, 5, 'Salminen', NULL, NULL, 'OH-STL',
    '2025-03-03 10:00:00+00', '2025-03-03 10:20:00+00',
    '2025-03-03 10:30:00+00', '2025-03-03 12:00:00+00',
    1.0, 40.0, 3, 1, '00:20:00', '00:30:00', 'EFHK', 'EFHK',
    NULL, 'OTH', 'N/A', 'Routine check',
    8, 8, FALSE, 'Club activity', 2
),
(
    2, 3, 'Järvinen', 4, 'Heikkinen', 'OH-P28',
    '2025-03-04 11:00:00+00', '2025-03-04 11:15:00+00',
    '2025-03-04 11:30:00+00', '2025-03-04 13:00:00+00',
    1.2, 55.0, 5, 3, '01:00:00', '01:15:00', 'EFHK', 'EFHK',
    'INV003', 'SAR', 'N/A', 'Cargo delivery',
    7, 7, TRUE, NULL, NULL
),
(
    5, 1, 'Korhonen', NULL, NULL, 'OH-IHQ',
    '2025-03-05 12:00:00+00', '2025-03-05 12:10:00+00',
    '2025-03-05 12:20:00+00', '2025-03-05 14:00:00+00',
    1.8, 70.0, 6, 2, '00:50:00', '01:00:00', 'EFHK', 'EFHK',
    'INV004', 'KOE', 'N/A', 'Passenger transport',
    6, 6, TRUE, NULL, NULL
);
