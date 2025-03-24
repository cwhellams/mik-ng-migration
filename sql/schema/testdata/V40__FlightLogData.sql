-- Insert test data for the flight.logs table
INSERT INTO flight.logs (
    billable_member_id,
    captain_member_id,
    captain,
    copilot_member_id,
    copilot,
    aircraft_registration,
    flight_date,
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
    1, -- billable_member_id
    6, -- captain_member_id
    'Virtanen', -- Captain (random Finnish surname)
    7, -- copilot_member_id
    'Nieminen', -- Copilot (random Finnish surname)
    'OH-STL', -- Assuming this registration exists in flight.aircraft
    '2025-03-01',
    '08:00:00',
    '08:15:00',
    '08:30:00',
    '10:00:00',
    1.5,
    50.0,
    4,
    1,
    '00:30:00',
    '00:45:00',
    'EFHK', -- Helsinki-Vantaa Airport
    'EFHK', -- Helsinki-Vantaa Airport
    'INV001',
    'Training',
    'N/A',
    'Smooth flight',
    'user1',
    'user1',
    TRUE, -- is_billable_flight
    NULL, -- non_billing_reason
    NULL  -- non_billing_approved_by_member_id
),
(
    3, -- billable_member_id
    8, -- captain_member_id
    'Lahtinen', -- Captain (random Finnish surname)
    9, -- copilot_member_id
    'Koskinen', -- Copilot (random Finnish surname)
    'OH-IHQ', -- Assuming this registration exists in flight.aircraft
    '2025-03-02',
    '09:00:00',
    '09:10:00',
    '09:20:00',
    '11:00:00',
    2.0,
    60.0,
    2,
    2,
    '00:45:00',
    '01:00:00',
    'EFHK', -- Helsinki-Vantaa Airport
    'EFTP', -- Tampere-Pirkkala Airport
    'INV002',
    'Commercial',
    'N/A',
    'Training flight',
    'user2',
    'user2',
    TRUE, -- is_billable_flight
    NULL, -- non_billing_reason
    NULL  -- non_billing_approved_by_member_id
),
(
    4, -- billable_member_id
    5, -- captain_member_id
    'Salminen', -- Captain (random Finnish surname)
    NULL, -- copilot_member_id
    NULL, -- No copilot
    'OH-STL', -- Assuming this registration exists in flight.aircraft
    '2025-03-03',
    '10:00:00',
    '10:20:00',
    '10:30:00',
    '12:00:00',
    1.0,
    40.0,
    3,
    1,
    '00:20:00',
    '00:30:00',
    'EFHK', -- Helsinki-Vantaa Airport
    'EFHK', -- Helsinki-Vantaa Airport
    NULL, -- Not billed
    'Private',
    'N/A',
    'Routine check',
    'user3',
    'user3',
    FALSE, -- is_billable_flight
    'Club activity', -- non_billing_reason
    2  -- non_billing_approved_by_member_id
),
(
    2, -- billable_member_id
    3, -- captain_member_id
    'Järvinen', -- Captain (random Finnish surname)
    4, -- copilot_member_id
    'Heikkinen', -- Copilot (random Finnish surname)
    'OH-P28', -- Assuming this registration exists in flight.aircraft
    '2025-03-04',
    '11:00:00',
    '11:15:00',
    '11:30:00',
    '13:00:00',
    1.2,
    55.0,
    5,
    3,
    '01:00:00',
    '01:15:00',
    'EFHK', -- Helsinki-Vantaa Airport
    'EFHK', -- Helsinki-Vantaa Airport
    'INV003',
    'Cargo',
    'N/A',
    'Cargo delivery',
    'user4',
    'user4',
    TRUE, -- is_billable_flight
    NULL, -- non_billing_reason
    NULL  -- non_billing_approved_by_member_id
),
(
    5, -- billable_member_id
    1, -- captain_member_id
    'Korhonen', -- Captain (random Finnish surname)
    NULL, -- copilot_member_id
    NULL, -- No copilot
    'OH-IHQ', -- Assuming this registration exists in flight.aircraft
    '2025-03-05',
    '12:00:00',
    '12:10:00',
    '12:20:00',
    '14:00:00',
    1.8,
    70.0,
    6,
    2,
    '00:50:00',
    '01:00:00',
    'EFHK', -- Helsinki-Vantaa Airport
    'EFHK', -- Helsinki-Vantaa Airport
    'INV004',
    'Passenger',
    'N/A',
    'Passenger transport',
    'user5',
    'user5',
    TRUE, -- is_billable_flight
    NULL, -- non_billing_reason
    NULL  -- non_billing_approved_by_member_id
);
