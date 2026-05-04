-- Test data: instructor (FI role) flights for testing the instructor worktime report.
--
-- Scenario:
--   Jukka1 (Jukka Nieminen) acts as a Flight Instructor (FI) in all three flights.
--   Matti1 and Anna1 are students (STU).
--
--   Flight fi_inst1: 2025-04-02, Matti1 (STU/PIC) + Jukka1 (FI/crew2), block 105 min, air 75 min
--   Flight fi_inst2: 2025-04-20, Anna1  (STU/PIC) + Jukka1 (FI/crew2), block 120 min, air 90 min
--   Flight fi_inst3: 2025-05-05, Jukka1 (FI/PIC)  + Liisa1 (STU/crew2), block 90 min,  air 70 min
--
-- Aircraft OH-P28 (ajlb_seq_no=4) is used because:
--   - It is not touched by the AJLB route tests (which exclusively use OH-IHQ).
--   - All dates are after the only non-NEW OH-P28 flight (da40tndra, 2025-03-04) so the
--     "Protected time period" trigger is not violated.
--
-- Epoch reference (UTC):
--   2025-04-02 08:00 = 1743584400
--   2025-04-20 10:00 = 1745139600
--   2025-05-05 08:00 = 1746435600

INSERT INTO flight.logs (
    flight_id,
    billable_member_id,
    pic_member_id,
    pic_last_name,
    pic_role,
    crew2_member_id,
    crew2_last_name,
    crew2_role,
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
    priv_or_com_flight,
    ajlb_seq_no,
    ajlb_blank_rows_before,
    status,
    is_dto_training_flight
) VALUES
-- Flight 1: 2025-04-02 08:00-09:45 UTC, block=105min, air=75min
-- Student Matti1 as PIC, Instructor Jukka1 as crew2 (FI); billed to Jukka1
(
    'fi_inst1',
    'Jukka1',
    'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
    'STU',
    'Jukka1',
    (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
    'FI',
    'OH-P28',
    1743584400, -- 2025-04-02 08:00 UTC
    1743585300, -- 2025-04-02 08:15 UTC
    1743589800, -- 2025-04-02 09:30 UTC
    1743590700, -- 2025-04-02 09:45 UTC
    1.0, 40.0, 15.0, 2, 1, 0, 0,
    'EFHK', 'EFHK',
    'SCHOOL', NULL, 'Instructor training flight',
    'k1mnimda', 'k1mnimda',
    TRUE,
    'C',
    4, 0,
    'NEW',
    FALSE
),
-- Flight 2: 2025-04-20 10:00-12:00 UTC, block=120min, air=90min
-- Student Anna1 as PIC, Instructor Jukka1 as crew2 (FI)
(
    'fi_inst2',
    'Anna1',
    'Anna1',
    (SELECT last_name FROM member.register WHERE member_id = 'Anna1'),
    'STU',
    'Jukka1',
    (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
    'FI',
    'OH-P28',
    1745139600, -- 2025-04-20 10:00 UTC
    1745140500, -- 2025-04-20 10:15 UTC
    1745145900, -- 2025-04-20 11:45 UTC
    1745146800, -- 2025-04-20 12:00 UTC
    0.5, 35.0, 10.0, 2, 2, 0, 0,
    'EFHK', 'EFHK',
    'SCHOOL', NULL, 'Navigation training with instructor',
    'k1mnimda', 'k1mnimda',
    TRUE,
    'C',
    4, 0,
    'NEW',
    FALSE
),
-- Flight 3: 2025-05-05 08:00-09:30 UTC, block=90min, air=70min
-- Instructor Jukka1 as PIC (FI), Student Liisa1 as crew2 (STU)
(
    'fi_inst3',
    'Jukka1',
    'Jukka1',
    (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
    'FI',
    'Liisa1',
    (SELECT last_name FROM member.register WHERE member_id = 'Liisa1'),
    'STU',
    'OH-P28',
    1746435600, -- 2025-05-05 08:00 UTC
    1746436200, -- 2025-05-05 08:10 UTC
    1746440400, -- 2025-05-05 09:20 UTC
    1746441000, -- 2025-05-05 09:30 UTC
    0.0, 30.0, 20.0, 2, 1, 0, 0,
    'EFHK', 'EFHK',
    'SCHOOL', NULL, 'Check flight with student Liisa',
    'k1mnimda', 'k1mnimda',
    TRUE,
    'C',
    4, 0,
    'NEW',
    FALSE
);
