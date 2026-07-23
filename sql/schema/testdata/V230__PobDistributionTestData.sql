-- Test data for the occupancy (persons-on-board) distribution stats on OH-STL:
-- gives the YTD and previous-year pie charts + summary table a realistic
-- spread across the 1-2 / 3 / 4+ pax buckets, with a mix of local and
-- cross-country flights of varying duration so the "Hours" and
-- "Cross-Country %" columns aren't flat.
DO $$
DECLARE
  rec RECORD;
  takeoff_ts TIMESTAMP;
  landing_ts TIMESTAMP;
BEGIN
  -- 2026 YTD flights: 6x 1-2 pax, 5x 3 pax, 4x 4 pax
  FOR rec IN
    SELECT * FROM (VALUES
      ('pob26a01'::varchar(9), 1, '2026-01-06'::date, false, 60),
      ('pob26a02'::varchar(9), 2, '2026-01-20'::date, true,  90),
      ('pob26a03'::varchar(9), 1, '2026-02-10'::date, false, 45),
      ('pob26a04'::varchar(9), 2, '2026-03-03'::date, true,  120),
      ('pob26a05'::varchar(9), 1, '2026-04-14'::date, false, 60),
      ('pob26a06'::varchar(9), 2, '2026-05-05'::date, false, 75),
      ('pob26b01'::varchar(9), 3, '2026-01-13'::date, true,  90),
      ('pob26b02'::varchar(9), 3, '2026-02-24'::date, false, 60),
      ('pob26b03'::varchar(9), 3, '2026-03-17'::date, true,  105),
      ('pob26b04'::varchar(9), 3, '2026-05-19'::date, false, 60),
      ('pob26b05'::varchar(9), 3, '2026-06-09'::date, true,  90),
      ('pob26c01'::varchar(9), 4, '2026-02-03'::date, true,  120),
      ('pob26c02'::varchar(9), 4, '2026-04-01'::date, false, 60),
      ('pob26c03'::varchar(9), 4, '2026-06-16'::date, true,  90),
      ('pob26c04'::varchar(9), 4, '2026-07-14'::date, false, 75)
    ) AS t(flight_id, pob, flight_date, is_xc, duration_mins)
  LOOP
    takeoff_ts := rec.flight_date + TIME '08:10:00';
    landing_ts := takeoff_ts + (rec.duration_mins || ' minutes')::interval;

    INSERT INTO flight.logs (
      flight_id, aircraft_registration, billable_member_id, pic_member_id, pic_last_name,
      pic_role, persons_on_board, off_block_time_epoch, takeoff_time_epoch, landing_time_epoch,
      on_block_time_epoch, night_flying_mins, instrument_flying_mins, number_of_landings,
      number_of_night_landings, departure_airport, arrival_airport, fuel_remaining_litres,
      is_dto_training_flight, flight_type, is_billable_flight, priv_or_com_flight, ajlb_seq_no,
      ajlb_blank_rows_before, created_by, updated_by
    ) VALUES (
      rec.flight_id, 'OH-STL', 'Teemu1', 'Teemu1', 'Kinnunen', 'PIC', rec.pob,
      EXTRACT(EPOCH FROM (takeoff_ts - INTERVAL '10 minutes'))::bigint,
      EXTRACT(EPOCH FROM takeoff_ts)::bigint,
      EXTRACT(EPOCH FROM landing_ts)::bigint,
      EXTRACT(EPOCH FROM (landing_ts + INTERVAL '10 minutes'))::bigint,
      0, 0, 1, 0, 'EFHK', CASE WHEN rec.is_xc THEN 'EFTU' ELSE 'EFHK' END, 20.00, false,
      'PRIVATE', true, 'C', 3, 0, 'k1mnimda', 'k1mnimda'
    );
  END LOOP;

  -- 2025 (previous year) flights: 10x 1-2 pax, 8x 3 pax, 7x 4 pax
  FOR rec IN
    SELECT * FROM (VALUES
      ('pob25a01'::varchar(9), 1, '2025-01-08'::date, false, 60),
      ('pob25a02'::varchar(9), 2, '2025-01-22'::date, true,  90),
      ('pob25a03'::varchar(9), 1, '2025-02-12'::date, false, 45),
      ('pob25a04'::varchar(9), 2, '2025-03-05'::date, true,  120),
      ('pob25a05'::varchar(9), 1, '2025-04-09'::date, false, 60),
      ('pob25a06'::varchar(9), 2, '2025-05-21'::date, false, 75),
      ('pob25a07'::varchar(9), 1, '2025-06-11'::date, true,  90),
      ('pob25a08'::varchar(9), 2, '2025-07-30'::date, false, 60),
      ('pob25a09'::varchar(9), 1, '2025-09-02'::date, false, 45),
      ('pob25a10'::varchar(9), 2, '2025-10-15'::date, true,  105),
      ('pob25b01'::varchar(9), 3, '2025-01-15'::date, true,  90),
      ('pob25b02'::varchar(9), 3, '2025-02-26'::date, false, 60),
      ('pob25b03'::varchar(9), 3, '2025-04-16'::date, true,  105),
      ('pob25b04'::varchar(9), 3, '2025-05-28'::date, false, 60),
      ('pob25b05'::varchar(9), 3, '2025-07-09'::date, true,  90),
      ('pob25b06'::varchar(9), 3, '2025-08-20'::date, false, 75),
      ('pob25b07'::varchar(9), 3, '2025-10-01'::date, true,  120),
      ('pob25b08'::varchar(9), 3, '2025-11-12'::date, false, 60),
      ('pob25c01'::varchar(9), 4, '2025-02-05'::date, true,  120),
      ('pob25c02'::varchar(9), 4, '2025-03-19'::date, false, 60),
      ('pob25c03'::varchar(9), 4, '2025-05-07'::date, true,  90),
      ('pob25c04'::varchar(9), 4, '2025-06-25'::date, false, 75),
      ('pob25c05'::varchar(9), 4, '2025-08-06'::date, true,  105),
      ('pob25c06'::varchar(9), 4, '2025-09-24'::date, false, 60),
      ('pob25c07'::varchar(9), 4, '2025-11-05'::date, true,  90)
    ) AS t(flight_id, pob, flight_date, is_xc, duration_mins)
  LOOP
    takeoff_ts := rec.flight_date + TIME '08:10:00';
    landing_ts := takeoff_ts + (rec.duration_mins || ' minutes')::interval;

    INSERT INTO flight.logs (
      flight_id, aircraft_registration, billable_member_id, pic_member_id, pic_last_name,
      pic_role, persons_on_board, off_block_time_epoch, takeoff_time_epoch, landing_time_epoch,
      on_block_time_epoch, night_flying_mins, instrument_flying_mins, number_of_landings,
      number_of_night_landings, departure_airport, arrival_airport, fuel_remaining_litres,
      is_dto_training_flight, flight_type, is_billable_flight, priv_or_com_flight, ajlb_seq_no,
      ajlb_blank_rows_before, created_by, updated_by
    ) VALUES (
      rec.flight_id, 'OH-STL', 'Teemu1', 'Teemu1', 'Kinnunen', 'PIC', rec.pob,
      EXTRACT(EPOCH FROM (takeoff_ts - INTERVAL '10 minutes'))::bigint,
      EXTRACT(EPOCH FROM takeoff_ts)::bigint,
      EXTRACT(EPOCH FROM landing_ts)::bigint,
      EXTRACT(EPOCH FROM (landing_ts + INTERVAL '10 minutes'))::bigint,
      0, 0, 1, 0, 'EFHK', CASE WHEN rec.is_xc THEN 'EFTU' ELSE 'EFHK' END, 20.00, false,
      'PRIVATE', true, 'C', 3, 0, 'k1mnimda', 'k1mnimda'
    );
  END LOOP;
END $$;
