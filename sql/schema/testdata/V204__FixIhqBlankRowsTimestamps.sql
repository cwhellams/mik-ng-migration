-- Move OH-IHQ seqNo=3 blank-row test flights from July 2025 to May 2025.
-- The no_overlaps trigger blocks any INSERT for OH-IHQ when a VALIDATED flight has
-- on_block_time_epoch > NEW.off_block_time_epoch. The accounting integration tests
-- insert OH-IHQ flights at BASE_TAKEOFF_EPOCH=2025-06-15 (and Jul 2025 for Suite 9),
-- so V203's July timestamps caused "Protected time period" failures.
-- Moving to May 2025 keeps ihq3fn1-3 before the Jun-15 base epoch.
--
-- The trigger blocks UPDATE on validated flights' time fields (Protected field),
-- so we must DELETE and re-INSERT.

-- 1. Remove the July 2025 flights
DELETE FROM flight.logs WHERE flight_id IN ('ihq3fn1', 'ihq3fn2', 'ihq3fn3');

-- 2. Adjust OH-IHQ AJLB dates to match the new May 2025 window
UPDATE flight.aircraft_journey_log_book
SET end_date = '2025-04-30'
WHERE aircraft_registration = 'OH-IHQ' AND seq_no = 2;

UPDATE flight.aircraft_journey_log_book
SET start_date = '2025-05-01'
WHERE aircraft_registration = 'OH-IHQ' AND seq_no = 3;

-- 3. Re-insert with May 2025 timestamps (on_block <= 2025-05-03T11:20Z << Jun-15 base epoch)
-- ihq3fn1: blank=0 -> page=600, row=1  (flight at FIRST row, no blank before)
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
) VALUES (
    'ihq3fn1', 'Matti1', 'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
    1746093600, 1746094200, 1746097800, 1746098400,
    0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 0, 1.0, 'VALIDATED', 800060, 600, 1, FALSE
);

-- ihq3fn2: blank=2 -> page=600, row=4  (2 blank rows in MIDDLE of page 600, rows 2-3 blank)
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
) VALUES (
    'ihq3fn2', 'Matti1', 'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
    1746180000, 1746180600, 1746184200, 1746184800,
    0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 2, 1.0, 'VALIDATED', 800120, 600, 4, FALSE
);

-- ihq3fn3: blank=3 -> page=602, row=3  (row 5 of p600=END; rows 1-2 of p602=START)
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
) VALUES (
    'ihq3fn3', 'Matti1', 'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-IHQ',
    1746266400, 1746267000, 1746270600, 1746271200,
    0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 3, 1.0, 'VALIDATED', 800180, 602, 3, FALSE
);
