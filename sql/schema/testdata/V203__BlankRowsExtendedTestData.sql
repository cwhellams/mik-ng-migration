-- Extended test data for blank row scenarios in OH-STL seqNo=3 and OH-IHQ seqNo=3.
-- rows_per_page=5 keeps the page layouts compact and easy to verify in the UI.
--
-- OH-STL seqNo=3 (start_page=500, validated_offset=0):
--   Page 500: [blank][blank] stl3fn1(row=3) [blank][blank]  <- blank at START; rows 4-5 trail before stl3fn2
--   Page 502: [blank][blank] stl3fn2(row=3) [blank] stl3fn3(row=5)  <- blank at START and MIDDLE
--
-- OH-IHQ seqNo=3 (start_page=600, validated_offset=0):
--   Page 600: ihq3fn1(row=1) [blank][blank] ihq3fn2(row=4) [blank]  <- blank in MIDDLE; row 5 trails before ihq3fn3
--   Page 602: [blank][blank] ihq3fn3(row=3) [blank][blank]  <- blank at START

-- Close the current open AJLBs so the new seqNo=3 books can be created
-- (ux_one_open_ajlb_per_aircraft allows only one null end_date per aircraft)
UPDATE flight.aircraft_journey_log_book
SET end_date = '2025-05-31'
WHERE aircraft_registration = 'OH-STL' AND seq_no = 2;

UPDATE flight.aircraft_journey_log_book
SET end_date = '2025-06-30'
WHERE aircraft_registration = 'OH-IHQ' AND seq_no = 2;

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
('OH-STL', 3, 90, 5, 500, 700000, '2025-06-01', null, 'k1mnimda', 'k1mnimda'),
('OH-IHQ', 3, 90, 5, 600, 800000, '2025-07-01', null, 'k1mnimda', 'k1mnimda');

-- OH-STL seqNo=3

-- stl3fn1: blank=2 -> abs_row=3 -> page=500, row=3  (2 blank rows at START of page 500)
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
    'stl3fn1', 'Matti1', 'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-STL',
    1748772000, 1748772600, 1748776200, 1748776800,
    0.0, 25.0, 20, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 2, 1.0, 'NEW', NULL, NULL, NULL, FALSE
);

-- stl3fn2: blank=4 -> abs_row=8 -> page=502, row=3  (rows 4-5 of p500 + rows 1-2 of p502 blank)
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
    'stl3fn2', 'Matti1', 'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-STL',
    1748858400, 1748859000, 1748862600, 1748863200,
    0.0, 25.0, 20, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 4, 1.0, 'NEW', NULL, NULL, NULL, FALSE
);

-- stl3fn3: blank=1 -> abs_row=10 -> page=502, row=5  (1 blank row in MIDDLE of page 502)
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
    'stl3fn3', 'Matti1', 'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'), 'PIC',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'OH-STL',
    1748944800, 1748945400, 1748949000, 1748949600,
    0.0, 25.0, 20, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 1, 1.0, 'NEW', NULL, NULL, NULL, FALSE
);

-- OH-IHQ seqNo=3

-- ihq3fn1: blank=0 -> page=600, row=1  (flight at FIRST row, no blank before)
-- VALIDATED with explicit page/row to avoid being moved by the "create AJLB" API which
-- relocates all NEW flights. Blank rows still render; only add/delete buttons are absent.
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
    1751364000, 1751364600, 1751368200, 1751368800,
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
    1751450400, 1751451000, 1751454600, 1751455200,
    0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 2, 1.0, 'VALIDATED', 800120, 600, 4, FALSE
);

-- ihq3fn3: blank=3 -> page=602, row=3  (row 5 of p600 blank=END; rows 1-2 of p602 blank=START)
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
    1751536800, 1751537400, 1751541000, 1751541600,
    0.0, 30.0, 25, 1, 1, 0, 0, 'EFHK', 'EFHK',
    NULL, 'PRIVATE', NULL, NULL, NULL, 'k1mnimda', 'k1mnimda', TRUE, NULL, NULL, 'C',
    3, 3, 1.0, 'VALIDATED', 800180, 602, 3, FALSE
);
