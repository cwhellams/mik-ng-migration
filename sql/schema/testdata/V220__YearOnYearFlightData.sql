-- Year-on-year flight data for OH-IHQ covering 2022-2025.
-- Provides 10 flights (Jan/May/Sep for 2022-2024, plus Jan 2025) so the YearOnYearReport chart has visible spread.
--
-- Historical flights violate flight.no_overlaps_function: existing VALIDATED
-- OH-IHQ flights (ihq3fn3 on_block=1746271200, 2025-05-03) block any INSERT
-- whose off_block is earlier. Disabling user triggers for the insert batch,
-- matching the pattern used in V218.

-- New AJLB book that spans the full test period; existing books (seq_no 1-3)
-- start in 2024 so cannot be referenced for 2022-2023 flights.
INSERT INTO flight.aircraft_journey_log_book (
    aircraft_registration, seq_no, no_of_pages, rows_per_page, start_page,
    start_flight_mins, start_date, end_date, created_by, updated_by
) VALUES
-- end_date must be non-null: ux_one_open_ajlb_per_aircraft allows only one open book per aircraft
-- (seq_no=3 is already open). Flights from 2025-05-15 onward use the existing seq_no=3.
('OH-IHQ', 10, 150, 10, 200, 0, '2022-01-01', '2025-04-30', 'k1mnimda', 'k1mnimda');

ALTER TABLE flight.logs DISABLE TRIGGER USER;

INSERT INTO flight.logs (
    flight_id, billable_member_id, pic_member_id, pic_last_name, pic_role,
    crew2_member_id, crew2_last_name, crew2_role, crew3_member_id, crew3_role,
    crew4_member_id, crew4_role, aircraft_registration,
    off_block_time_epoch, takeoff_time_epoch, landing_time_epoch, on_block_time_epoch,
    oil_uplift_litres, fuel_uplift_litres, fuel_remaining_litres,
    persons_on_board, number_of_landings, night_flying_mins, instrument_flying_mins,
    departure_airport, arrival_airport, invoice_number, flight_type,
    billing_remarks, incident_or_observations, personal_remarks,
    created_by, updated_by, is_billable_flight,
    non_billing_reason, non_billing_approved_by_member_id, priv_or_com_flight,
    ajlb_seq_no, ajlb_blank_rows_before, total_time_in_service, status,
    ajlb_total_flight_mins, ajlb_page_number, ajlb_row_number, is_dto_training_flight
) VALUES

-- 2022-01-15  PRIVATE  90 min
('yoy_001', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1642237200, 1642237500, 1642242900, 1642243200,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.5, 'VALIDATED', 90, 200, 1, FALSE),

-- 2022-05-15  SCHOOL  75 min
('yoy_002', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1652605200, 1652605500, 1652610000, 1652610300,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'SCHOOL', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.25, 'VALIDATED', 165, 200, 2, FALSE),

-- 2022-09-15  PRIVATE  120 min
('yoy_003', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1663232400, 1663232700, 1663239900, 1663240200,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 2.0, 'VALIDATED', 285, 200, 3, FALSE),

-- 2023-01-15  SCHOOL  60 min
('yoy_004', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1673773200, 1673773500, 1673777100, 1673777400,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'SCHOOL', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.0, 'VALIDATED', 345, 201, 1, FALSE),

-- 2023-05-15  PRIVATE  90 min
('yoy_005', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1684141200, 1684141500, 1684146900, 1684147200,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.5, 'VALIDATED', 435, 201, 2, FALSE),

-- 2023-09-15  SCHOOL  75 min
('yoy_006', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1694768400, 1694768700, 1694773200, 1694773500,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'SCHOOL', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.25, 'VALIDATED', 510, 201, 3, FALSE),

-- 2024-01-15  PRIVATE  60 min
('yoy_007', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1705309200, 1705309500, 1705313100, 1705313400,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.0, 'VALIDATED', 570, 202, 1, FALSE),

-- 2024-05-15  SCHOOL  120 min
('yoy_008', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1715763600, 1715763900, 1715771100, 1715771400,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'SCHOOL', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 2.0, 'VALIDATED', 690, 202, 2, FALSE),

-- 2024-09-15  PRIVATE  90 min
('yoy_009', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1726390800, 1726391100, 1726396500, 1726396800,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.5, 'VALIDATED', 780, 202, 3, FALSE),

-- 2025-01-15  SCHOOL  75 min
('yoy_010', 'Matti1', 'Matti1',
 (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
 1736931600, 1736931900, 1736936400, 1736936700,
 0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
 NULL, 'SCHOOL', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'P',
 10, 0, 1.25, 'VALIDATED', 855, 203, 1, FALSE);

ALTER TABLE flight.logs ENABLE TRIGGER USER;
