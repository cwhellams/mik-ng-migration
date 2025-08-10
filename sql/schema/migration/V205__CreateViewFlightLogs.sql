create view flight.vw_flight_logs as

with last_validated as (
    SELECT DISTINCT ON (aircraft_registration, ajlb_seq_no) 
        aircraft_registration,
        ajlb_seq_no,
        on_block_time_utc,
        ajlb_page_number,
        ajlb_row_number,
        ajlb_total_flight_mins,
        ajlb_total_flight_time
    FROM flight.logs
    where status != 'NEW'
    order by aircraft_registration, ajlb_seq_no, on_block_time_epoch desc
)

select 
    flight_id,
    ac_total_flight_mins::int4,
    format_flight_time(ac_total_flight_mins) as ac_total_flight_time,
    1 + mod(ajlb_row_number - 1, rows_per_page)::int4 as row_number,
    (1 + (ajlb_row_number - 1) / rows_per_page)::int4 as page_number

from (
    select 
        l.flight_id,

        (coalesce(validated.ajlb_total_flight_mins, ajlb.minutes_at_start, 0) + sum(l.flight_mins)
            over (
                partition by l.aircraft_registration, l.ajlb_seq_no  
                order by l.off_block_time_epoch)
            ) as ac_total_flight_mins,

         coalesce(validated.ajlb_row_number + (validated.ajlb_page_number - 1) * ajlb.rows_per_page, 0) 
            + sum(l.ajlb_blank_rows_before + 1)
            over (
                partition by l.aircraft_registration, l.ajlb_seq_no
                order by l.off_block_time_epoch
            ) as ajlb_row_number,

        ajlb.rows_per_page as rows_per_page

    from flight.logs as l

    left join flight.aircraft_journey_log_book as ajlb on
        ajlb.aircraft_registration = l.aircraft_registration
        and ajlb.seq_no = l.ajlb_seq_no

    left join last_validated as validated
        on l.aircraft_registration = validated.aircraft_registration
        and l.ajlb_seq_no = validated.ajlb_seq_no

    where l.status = 'NEW'
);