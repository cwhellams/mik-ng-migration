-- Past reservations with matching flight log entries, for the per-member reservation
-- efficiency report (#1174). All other bookings test data (V120__bookings.sql) is
-- scheduled in the future, so there was nothing to report on for a member yet.
--
-- Dates are relative to CURRENT_DATE (not hardcoded), so this keeps working next year.
-- Bookings and flights are matched the same way member-efficiency-queries.ts matches
-- them: same aircraft registration, flight off/on-block interval inside the reservation
-- window. Times are minute-aligned (required by check_all_times_in_mins on both tables).
--
-- All matched flights use OH-STL with ajlb_seq_no = 3, the logbook that is currently
-- open (its other rows are the only NEW-status OH-STL flights). OH-IHQ has no open
-- logbook in the existing fixture data (its highest seq_no, 10, is fully VALIDATED), so
-- adding a NEW flight there would either land in an already-closed book or require
-- opening a fresh flight.aircraft_journey_log_book row of its own.
--
-- Members: Kaisa1, Pekka1 and Anna1 -- deliberately not Matti1/Jukka1/Liisa1, who a lot
-- of other backend tests pin to exact flight/booking counts and specific "last flight on
-- OH-STL" narratives (e.g. test/db/flight-log-queries.test.ts's "Db Flight statistics"
-- suite, and the "Jukka1 is billed for no OH-STL flight at all" fixture in
-- test/routes/flight-log/api.test.ts). Kaisa1/Pekka1/Anna1 carry no such assertions.
delete from schedule.bookings where booking_id like 'eff%';
delete from flight.logs where flight_id like 'eff%';

-- Kaisa1 / OH-STL, 20 days ago: booking 08:00-12:00, flight off/on-block 09:01-11:20
-- (matches the exact example from #1174) -> partial efficiency, gaps at both ends.
insert into schedule.bookings (
    booking_id, member_id, registration, booking_type, booking_status,
    start_time_epoch, end_time_epoch, instructor_member_id, created_by, updated_by
  )
values (
    'eff1',
    'Kaisa1',
    'OH-STL',
    'PRACTICE',
    'CONFIRMED',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 20) + MAKE_INTERVAL(HOURS => 8))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 20) + MAKE_INTERVAL(HOURS => 12))),
    NULL,
    'Kaisa1',
    'Kaisa1'
  );

insert into flight.logs (
    flight_id, billable_member_id, pic_member_id, pic_last_name, pic_role,
    aircraft_registration, off_block_time_epoch, takeoff_time_epoch, landing_time_epoch,
    on_block_time_epoch, fuel_remaining_litres, persons_on_board, number_of_landings,
    night_flying_mins, instrument_flying_mins, departure_airport, arrival_airport,
    flight_type, is_billable_flight, priv_or_com_flight, ajlb_seq_no,
    ajlb_blank_rows_before, created_by, updated_by, is_dto_training_flight
  )
values (
    'eff1fl',
    'Kaisa1',
    'Kaisa1',
    (select last_name from member.register where member_id = 'Kaisa1'),
    'PIC',
    'OH-STL',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 20) + MAKE_INTERVAL(HOURS => 9, MINS => 1))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 20) + MAKE_INTERVAL(HOURS => 9, MINS => 6))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 20) + MAKE_INTERVAL(HOURS => 11, MINS => 15))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 20) + MAKE_INTERVAL(HOURS => 11, MINS => 20))),
    30,
    2,
    1,
    0,
    0,
    'EFHK',
    'EFHK',
    'PRACTICE',
    TRUE,
    'C',
    3,
    0,
    'Kaisa1',
    'Kaisa1',
    (select is_training_program_pilot from member.register where member_id = 'Kaisa1')
  );

-- Pekka1 / OH-STL, 15 days ago: TRAINING booking 08:00-12:00 with an instructor, flight
-- 08:05-11:55 -> tight fit, high efficiency, no underused flag.
insert into schedule.bookings (
    booking_id, member_id, registration, booking_type, booking_status,
    start_time_epoch, end_time_epoch, instructor_member_id, created_by, updated_by
  )
values (
    'eff2',
    'Pekka1',
    'OH-STL',
    'TRAINING',
    'CONFIRMED',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 15) + MAKE_INTERVAL(HOURS => 8))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 15) + MAKE_INTERVAL(HOURS => 12))),
    'Juha1',
    'Pekka1',
    'Pekka1'
  );

insert into flight.logs (
    flight_id, billable_member_id, pic_member_id, pic_last_name, pic_role,
    crew2_member_id, crew2_last_name, crew2_role,
    aircraft_registration, off_block_time_epoch, takeoff_time_epoch, landing_time_epoch,
    on_block_time_epoch, fuel_remaining_litres, persons_on_board, number_of_landings,
    night_flying_mins, instrument_flying_mins, departure_airport, arrival_airport,
    flight_type, is_billable_flight, priv_or_com_flight, ajlb_seq_no,
    ajlb_blank_rows_before, created_by, updated_by, is_dto_training_flight
  )
values (
    'eff2fl',
    'Pekka1',
    'Pekka1',
    (select last_name from member.register where member_id = 'Pekka1'),
    'STU',
    'Juha1',
    (select last_name from member.register where member_id = 'Juha1'),
    'FI',
    'OH-STL',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 15) + MAKE_INTERVAL(HOURS => 8, MINS => 5))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 15) + MAKE_INTERVAL(HOURS => 8, MINS => 10))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 15) + MAKE_INTERVAL(HOURS => 11, MINS => 50))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 15) + MAKE_INTERVAL(HOURS => 11, MINS => 55))),
    45,
    2,
    3,
    0,
    0,
    'EFHK',
    'EFHK',
    'SCHOOL',
    TRUE,
    'C',
    3,
    0,
    'Pekka1',
    'Pekka1',
    (select is_training_program_pilot from member.register where member_id = 'Pekka1')
  );

-- Anna1 / OH-STL, 10 days ago: booking 08:00-10:00 with no flight logged at all -> no-show.
insert into schedule.bookings (
    booking_id, member_id, registration, booking_type, booking_status,
    start_time_epoch, end_time_epoch, instructor_member_id, created_by, updated_by
  )
values (
    'eff3',
    'Anna1',
    'OH-STL',
    'PRACTICE',
    'CONFIRMED',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 10) + MAKE_INTERVAL(HOURS => 8))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 10) + MAKE_INTERVAL(HOURS => 10))),
    NULL,
    'Anna1',
    'Anna1'
  );

-- Kaisa1 / OH-STL, 5 days ago: a second booking, an 8-minute flight right at the end of
-- the slot -> heavily underused (large head gap).
insert into schedule.bookings (
    booking_id, member_id, registration, booking_type, booking_status,
    start_time_epoch, end_time_epoch, instructor_member_id, created_by, updated_by
  )
values (
    'eff4',
    'Kaisa1',
    'OH-STL',
    'PRACTICE',
    'CONFIRMED',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 5) + MAKE_INTERVAL(HOURS => 8))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 5) + MAKE_INTERVAL(HOURS => 10))),
    NULL,
    'Kaisa1',
    'Kaisa1'
  );

insert into flight.logs (
    flight_id, billable_member_id, pic_member_id, pic_last_name, pic_role,
    aircraft_registration, off_block_time_epoch, takeoff_time_epoch, landing_time_epoch,
    on_block_time_epoch, fuel_remaining_litres, persons_on_board, number_of_landings,
    night_flying_mins, instrument_flying_mins, departure_airport, arrival_airport,
    flight_type, is_billable_flight, priv_or_com_flight, ajlb_seq_no,
    ajlb_blank_rows_before, created_by, updated_by, is_dto_training_flight
  )
values (
    'eff4fl',
    'Kaisa1',
    'Kaisa1',
    (select last_name from member.register where member_id = 'Kaisa1'),
    'PIC',
    'OH-STL',
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 5) + MAKE_INTERVAL(HOURS => 9, MINS => 50))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 5) + MAKE_INTERVAL(HOURS => 9, MINS => 52))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 5) + MAKE_INTERVAL(HOURS => 9, MINS => 57))),
    extract(epoch from (current_date - MAKE_INTERVAL(DAYS => 5) + MAKE_INTERVAL(HOURS => 9, MINS => 58))),
    50,
    1,
    1,
    0,
    0,
    'EFHK',
    'EFHK',
    'PRACTICE',
    TRUE,
    'C',
    3,
    0,
    'Kaisa1',
    'Kaisa1',
    (select is_training_program_pilot from member.register where member_id = 'Kaisa1')
  );
