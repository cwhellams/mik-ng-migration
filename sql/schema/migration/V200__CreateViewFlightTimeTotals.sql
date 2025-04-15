create view flight.vw_flight_time_totals as

with current_ajlb as (
    select
        aircraft_registration,
        seq_no,
        flight_time,
        minutes_at_start
    from flight.aircraft_journey_log_book
    where end_date is NULL
),

flight_log as (
    select
        ajlb.aircraft_registration,
        ajlb.seq_no,
        coalesce(sum(l.flight_mins), 0) as sum_flight_mins
    from
        flight.aircraft_journey_log_book as ajlb
        left join
            flight.logs as l
            on
                ajlb.aircraft_registration = l.aircraft_registration
                and ajlb.seq_no = l.ajlb_seq_no
    where
        ajlb.end_date is NULL
    group by
        ajlb.aircraft_registration,
        ajlb.seq_no
)

select
    ajlb.aircraft_registration,
    ajlb.seq_no as ajlb_seq_no,
    ajlb.flight_time as total_flight_time_at_ajlb_start,
    ajlb.minutes_at_start as total_flight_mins_at_ajlb_start,
    l.sum_flight_mins::int4 as flight_log_mins_this_ajlb,
    format_flight_time(l.sum_flight_mins) as flight_time_this_ajlb,
    format_flight_time(
        ajlb.minutes_at_start + l.sum_flight_mins
    ) as ac_total_flight_time


from
    current_ajlb as ajlb left join flight_log as l on
    ajlb.aircraft_registration = l.aircraft_registration
    and ajlb.seq_no = l.seq_no
