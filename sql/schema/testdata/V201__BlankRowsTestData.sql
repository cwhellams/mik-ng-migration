-- Test data for logbook empty rows feature
-- AJLB OH-P28 seq 10 (closed), rows_per_page=5, used to verify blank row rendering
-- Uses OH-P28 (not OH-STL or OH-IHQ) so the VALIDATED flights don't block any test
-- insertions: no test inserts OH-P28 flights, and OH-P28's last seed-data flight is
-- 2025-03-04 which is before these April 2025 dates.
-- April 2025 dates keep these flights out of the endDate=2025-03-06 count query.
INSERT INTO flight.aircraft_journey_log_book (
    aircraft_registration,
    seq_no,
    no_of_pages,
    rows_per_page,
    start_page,
    start_flight_mins,
    start_date,
    end_date,
    created_by,
    updated_by
) VALUES
('OH-P28', 10, 10, 5, 200, 290000, '2025-04-01', '2025-07-01', 'k1mnimda', 'k1mnimda');

-- Row 3 on page 200 (2 leading blank rows before it)
-- Each flight is a separate INSERT so the AFTER trigger sees a consistent state per row
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
    'blnkrow01', 'Matti1', 'Matti1',
    (select last_name from member.register where member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-P28',
    1743472800, 1743473400, 1743476400, 1743477000,
    0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'Matti1', 'Matti1', TRUE, NULL, NULL, 'C',
    10, 2, 1.5, 'VALIDATED', 290090, 200, 3, FALSE
);

-- Row 5 on page 200 (1 leading blank row between row 3 and row 5)
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
    'blnkrow02', 'Matti1', 'Matti1',
    (select last_name from member.register where member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-P28',
    1743559200, 1743559800, 1743562800, 1743563400,
    0.0, 20.0, 15, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'Matti1', 'Matti1', TRUE, NULL, NULL, 'C',
    10, 1, 1.5, 'VALIDATED', 290150, 200, 5, FALSE
);

-- NEW flight: view computes position as last validated (row 5) + 1 blank + 1 = row 7 → page 202, row 2
-- ajlb_blank_rows_before=1 drives the view calculation; ajlb_page/row_number must be NULL for NEW status
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
    'blnkrow03', 'Matti1', 'Matti1',
    (select last_name from member.register where member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-P28',
    1743645600, 1743646200, 1743649200, 1743649800,
    0.0, 25.0, 20, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'Matti1', 'Matti1', TRUE, NULL, NULL, 'C',
    10, 1, 1.5, 'NEW', NULL, NULL, NULL, FALSE
);
