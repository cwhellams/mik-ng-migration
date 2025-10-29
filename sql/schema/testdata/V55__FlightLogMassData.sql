INSERT INTO flight.logs (
        flight_id,
        billable_member_id,
        pic_member_id,
        pic_last_name,
        pic_role,
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
        status,
        is_dto_training_flight
    )
SELECT 'mass' || i,
    (
        array_sample(
            ARRAY [
            'Pekka1',
            'Liisa1',
            'Anna1',
            'Kaisa1',
            'Juha1'
            ],
            1
        )
    ) [1],
    'Pekka1',
    'Hämäläinen',
    'PIC',
    'OH-STL',
    1262304000 + i * 72000,
    1262304000 + i * 72000 + 5 * 60,
    -- 5 minute taxi to runway
    1262304000 + i * 72000 + (10 + i) * 60,
    -- 10 + i minutes flight time
    1262304000 + i * 72000 + (15 + i) * 60,
    -- 5 minute taxi to ramp
    (ROUND(random() * 10) / 10),
    10 + ROUND(random() * 50),
    10 + ROUND(random() * 30),
    1 + ROUND(random() * 3),
    1 + ROUND(random() * 4),
    ROUND(random() * 15),
    0,
    'EFHK',
    'EFHK',
    CASE
        WHEN i = 100 THEN 'SII'
        WHEN i = 101 THEN 'KOE'
        ELSE 'HAR'
    END,
    NULL,
    NULL,
    'Antti1',
    'Antti1',
    TRUE,
    NULL,
    NULL,
    'P',
    1,
    0,
    'NEW',
    FALSE
FROM generate_series(1, 200) i;
ALTER TABLE flight.logs DISABLE TRIGGER USER;
UPDATE flight.logs
SET status = CASE
        WHEN off_block_time_epoch < 1262664000 THEN 'PAID'::flight_log_status
        WHEN off_block_time_epoch < 1262880000 THEN 'INVOICED'::flight_log_status
        ELSE 'VALIDATED'::flight_log_status
    END,
    ajlb_total_flight_mins = (
        select ac_total_flight_mins
        from flight.vw_flight_logs
        where flight_id = flight.logs.flight_id
    ),
    ajlb_page_number = (
        select page_number
        from flight.vw_flight_logs
        where flight_id = flight.logs.flight_id
    ),
    ajlb_row_number = (
        select row_number
        from flight.vw_flight_logs
        where flight_id = flight.logs.flight_id
    )
WHERE off_block_time_epoch < 1276200000;
-- before 2010-01-11 00:00:00 UTC
ALTER TABLE flight.logs ENABLE TRIGGER USER;