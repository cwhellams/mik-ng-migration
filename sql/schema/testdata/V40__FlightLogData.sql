-- Insert test data for the flight.logs table
INSERT INTO flight.logs (
    captain,
    copilot,
    aircraft_registration,
    flight_date,
    on_block_time,
    off_block_time,
    takeoff_time,
    landing_time,
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
    remarks
) VALUES
(
    1, -- Assuming member_id 1 exists in member.register
    2, -- Assuming member_id 2 exists in member.register
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
    'Smooth flight'
),
(
    3, -- Assuming member_id 3 exists in member.register
    4, -- Assuming member_id 4 exists in member.register
    'OH-ABC', -- Assuming this registration exists in flight.aircraft
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
    'Training flight'
),
(
    5, -- Assuming member_id 5 exists in member.register
    NULL, -- No copilot
    'OH-XYZ', -- Assuming this registration exists in flight.aircraft
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
    'Routine check'
),
(
    6, -- Assuming member_id 6 exists in member.register
    7, -- Assuming member_id 7 exists in member.register
    'OH-DEF', -- Assuming this registration exists in flight.aircraft
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
    'Cargo delivery'
),
(
    8, -- Assuming member_id 8 exists in member.register
    NULL, -- No copilot
    'OH-GHI', -- Assuming this registration exists in flight.aircraft
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
    'Passenger transport'
);
