create view flight.vw_flight_time_totals as

with flight_log as (
    select
        ajlb.aircraft_registration,
        ajlb.seq_no,
        ajlb.flight_time,
        ajlb.rows_per_page,
        ajlb.minutes_at_start,
        ajlb.end_date,
        coalesce(sum(l.flight_mins), 0) as sum_flight_mins,
        count(*) as sum_flights,
        sum(l.ajlb_blank_rows_before) as sum_empty_rows
    from
        flight.aircraft_journey_log_book as ajlb
        left join
            flight.logs as l
            on
                ajlb.aircraft_registration = l.aircraft_registration
                and ajlb.seq_no = l.ajlb_seq_no
    group by
        ajlb.aircraft_registration,
        ajlb.seq_no
)

select
    aircraft_registration,
    seq_no as ajlb_seq_no,
    end_date is NULL as current,
    flight_time as total_flight_time_at_ajlb_start,
    minutes_at_start as total_flight_mins_at_ajlb_start,
    sum_flight_mins::int4 as flight_log_mins_this_ajlb,
    format_flight_time(sum_flight_mins) as flight_time_this_ajlb,
    format_flight_time(
        minutes_at_start + sum_flight_mins
    ) as ac_total_flight_time,
    (minutes_at_start + sum_flight_mins)/60.0 as ac_total_flight_hours,
    sum_flights::int4 as flight_logs_this_ajlb,
    (1 + (sum_flights + sum_empty_rows) / rows_per_page)::int4 as pages_in_use

from flight_log
