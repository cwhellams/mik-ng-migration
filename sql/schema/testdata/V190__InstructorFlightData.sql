-- Test data: instructor (FI role) flights for testing the instructor worktime report.
--
-- Scenario:
--   Jukka1 (Jukka Nieminen) acts as a Flight Instructor (FI) in all three flights.
--   Matti1 and Anna1 are students (STU).
--
--   Flight fi_inst1: 2025-01-15, Matti1 (STU/PIC) + Jukka1 (FI/crew2), block 105 min, air 75 min
--   Flight fi_inst2: 2025-03-20, Anna1  (STU/PIC) + Jukka1 (FI/crew2), block 120 min, air 90 min
--   Flight fi_inst3: 2025-06-10, Jukka1 (FI/PIC)  + Liisa1 (STU/crew2), block 90 min,  air 70 min
--
-- Epoch reference (UTC):
--   2025-01-15 09:00 = 1736931600
--   2025-03-20 10:00 = 1742464800
--   2025-06-10 08:00 = 1749542400

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
-- Flight 1: 2025-01-15 09:00-10:45 UTC, block=105min, air=75min
-- Student Matti1 as PIC, Instructor Jukka1 as crew2 (FI)
(
    'fi_inst1',
    'Matti1',
    'Matti1',
    (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
    'STU',
    'Jukka1',
    (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
    'FI',
    'OH-STL',
    1736931600, -- 2025-01-15 09:00 UTC
    1736932500, -- 2025-01-15 09:15 UTC
    1736937000, -- 2025-01-15 10:30 UTC
    1736937900, -- 2025-01-15 10:45 UTC
    1.0, 40.0, 15.0, 2, 1, 0, 0,
    'EFHK', 'EFHK',
    'SCHOOL', NULL, 'Instructor training flight',
    'k1mnimda', 'k1mnimda',
    TRUE,
    'C',
    2, 0,
    'NEW',
    FALSE
),
-- Flight 2: 2025-03-20 10:00-12:00 UTC, block=120min, air=105min
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
    'OH-STL',
    1742464800, -- 2025-03-20 10:00 UTC
    1742465700, -- 2025-03-20 10:15 UTC
    1742471100, -- 2025-03-20 11:45 UTC
    1742472000, -- 2025-03-20 12:00 UTC
    0.5, 35.0, 10.0, 2, 2, 0, 0,
    'EFHK', 'EFHK',
    'SCHOOL', NULL, 'Navigation training with instructor',
    'k1mnimda', 'k1mnimda',
    TRUE,
    'C',
    2, 0,
    'NEW',
    FALSE
),
-- Flight 3: 2025-06-10 08:00-09:30 UTC, block=90min, air=70min
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
    'OH-STL',
    1749542400, -- 2025-06-10 08:00 UTC
    1749543000, -- 2025-06-10 08:10 UTC
    1749547200, -- 2025-06-10 09:20 UTC
    1749547800, -- 2025-06-10 09:30 UTC
    0.0, 30.0, 20.0, 2, 1, 0, 0,
    'EFHK', 'EFHK',
    'SCHOOL', NULL, 'Check flight with student Liisa',
    'k1mnimda', 'k1mnimda',
    TRUE,
    'C',
    2, 0,
    'NEW',
    FALSE
);
