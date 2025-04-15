INSERT INTO flight.logs (
    flight_id,
    billable_member_id,
    pic_member_id,
    pic_role,
    crew2_member_id,
    crew2_role,
    crew3_member_id,
    crew3_role,
    crew4_member_id,
    crew4_role,
    aircraft_registration,
    off_block_time_epoch,
    takeoff_time_epoch,
    landing_time_epoch,
    on_block_time_epoch,
    oil_uplift_litres,
    fuel_uplift_litres,
    fuel_remaining_litres,
    persons_on_board,
    number_of_landings,
    night_flying_mins,
    instrument_flying_mins,
    departure_airport,
    arrival_airport,
    invoice_number,
    flight_type,
    billing_remarks,
    personal_remarks,
    created_by,
    updated_by,
    is_billable_flight,
    non_billing_reason,
    non_billing_approved_by_member_id,
    priv_or_com_flight,
    ajlb_seq_no,
    ajlb_blank_rows_before,
    total_time_in_service,
    status
) VALUES
-- Record 1
(
    'mikify', 1, 6, 'PIC', 7, 'FI', NULL, NULL, NULL, NULL, 'OH-STL',
    1740816000, 1740816900, 1740823200, 1740824100,
    1.5, 50.0, 0, 4, 1, 30, 45, 'EFHK', 'EFHK',
    'INV001', 'KOU', 'N/A', 'Smooth flight',
    10, 10, TRUE, NULL, NULL, 'C', 1, 0, 2.0, 'NEW'
),
-- Record 2
(
    'efnu4evr', 3, 8, 'PIC', 9, 'FI', NULL, NULL, NULL, NULL, 'OH-IHQ',
    1740906000, 1740907200, 1740914400, 1740915000,
    2.0, 60.0, 0, 2, 2, 45, 60, 'EFHK', 'EFTP',
    'INV002', 'MAT', 'N/A', 'Training flight',
    9, 9, TRUE, NULL, NULL, 'C', 2, 0, 2.0, 'NEW'
),
-- Record 3
(
    'bLwnAstr0', 4, 5, 'PIC', 8, 'FE', NULL, NULL, NULL, NULL, 'OH-STL',
    1740996000, 1740997800, 1741003200, 1741003920,
    1.0, 40.0, 0, 3, 1, 20, 30, 'EFHK', 'EFHK',
    NULL, 'OTH', 'N/A', 'Routine check',
    8, 8, FALSE, 'Club activity', 2, 'C', 2, 0, 1.5, 'NEW'
),
-- Record 4
(
    'da40tndra', 2, 3, 'PIC', 4, 'FI', NULL, NULL, NULL, NULL, 'OH-P28',
    1741086000, 1741087800, 1741094400, 1741095300,
    1.2, 55.0, 0, 5, 3, 60, 75, 'EFHK', 'EFHK',
    'INV003', 'SAR', 'N/A', 'Cargo delivery',
    7, 7, TRUE, NULL, NULL, 'C', 4, 0, 1.735, 'NEW'
),
-- Record 5 (Cross-day flight)
(
    'eject', 5, 7, 'PIC', 8, 'FE', NULL, NULL, NULL, NULL, 'OH-STL',
    1710198300, -- 2025-03-11 23:05:00
    1710198900, -- 2025-03-11 23:15:00 (10 min taxi)
    1710205200, -- 2025-03-12 00:40:00 (1h 25m flight)
    1710205800, -- 2025-03-12 01:00:00 (20 min taxi)
    1.0, 45.0, 0, 2, 1, 115, 60, 'EFHK', 'EFTU',
    'INV004', 'NAV', 'Night navigation exercise', 'Cross-day night flight',
    6, 6, TRUE, NULL, NULL, 'C', 2, 0, 1.92, 'NEW'
);
