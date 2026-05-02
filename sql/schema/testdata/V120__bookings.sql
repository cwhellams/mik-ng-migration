delete from schedule.bookings
where booking_id like 'mass%'
  or booking_id like 'stl%'
  or booking_id like 'ihq%';
insert into schedule.bookings (
    booking_id,
    member_id,
    registration,
    booking_type,
    booking_status,
    start_time_epoch,
    end_time_epoch,
    instructor_member_id,
    created_by,
    updated_by
  )
select 'stl' || i,
  (
    array_sample(
      ARRAY [
                'Liisa1',
                'Anna1',
                'Kaisa1',
                'Juha1',
                'Matti1'
            ],
      1
    )
  ) [1],
  'OH-STL',
  'TRAINING',
  'CONFIRMED',
  extract(
    epoch
    from (
        current_date + MAKE_INTERVAL(DAYS => i) + MAKE_INTERVAL(HOURS => 5)
      )
  ),
  extract(
    epoch
    from (
        current_date + MAKE_INTERVAL(DAYS => i) + MAKE_INTERVAL(HOURS => 6 + (ROUND(random() * 5)::int))
      )
  ),
  (
    array_sample(
      ARRAY [
                'Matti1',
                'Jukka1',
                'Antti1'
            ],
      1
    )
  ) [1],
  'Liisa1',
  'Liisa1'
FROM generate_series(1, 20) i;
insert into schedule.bookings (
    booking_id,
    member_id,
    registration,
    booking_type,
    booking_status,
    start_time_epoch,
    end_time_epoch,
    instructor_member_id,
    created_by,
    updated_by
  )
select 'ihq' || i,
  (
    array_sample(
      ARRAY [
                'Liisa1',
                'Anna1',
                'Kaisa1',
                'Juha1',
                'Matti1'
            ],
      1
    )
  ) [1],
  'OH-IHQ',
  'TRAINING',
  'CONFIRMED',
  extract(
    epoch
    from (
        current_date + MAKE_INTERVAL(DAYS => i) + MAKE_INTERVAL(HOURS => 5)
      )
  ),
  extract(
    epoch
    from (
        current_date + MAKE_INTERVAL(DAYS => i) + MAKE_INTERVAL(HOURS => 6 + (ROUND(random() * 3)::int))
      )
  ),
  (
    array_sample(
      ARRAY [
                'Matti1',
                'Jukka1',
                'Antti1'
            ],
      1
    )
  ) [1],
  'Liisa1',
  'Liisa1'
FROM generate_series(1, 20) i;