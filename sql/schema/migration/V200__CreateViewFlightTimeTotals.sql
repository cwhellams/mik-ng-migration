create view flight.vw_flight_time_totals as

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
),

new_flights as (
    select
        aircraft_registration,
        ajlb_seq_no,
        coalesce(sum(flight_mins), 0) as sum_unverified_mins,
        count(*) as sum_unverified_flights,
        sum(ajlb_blank_rows_before) as sum_empty_rows,
        (select ajlb_blank_rows_before from flight.logs first_new
            where 
                first_new.status = 'NEW' AND
                first_new.aircraft_registration = aircraft_registration AND 
                first_new.ajlb_seq_no = ajlb_seq_no
            order by on_block_time_epoch asc limit 1
        ) as first_empty_rows
    from flight.logs
    where status = 'NEW'
    group by
        aircraft_registration,
        ajlb_seq_no
)

select
    ajlb.aircraft_registration,
    ajlb.seq_no as ajlb_seq_no,
    end_date is NULL as current,
    validated.on_block_time_utc validated_on_block_time_utc,
    coalesce(validated.ajlb_total_flight_mins, ajlb.minutes_at_start, 0) as validated_total_flight_mins,
    format_flight_time(coalesce(validated.ajlb_total_flight_mins, ajlb.minutes_at_start, 0)) as validated_total_flight_time,

    format_flight_time(
        coalesce(validated.ajlb_total_flight_mins, minutes_at_start, 0) 
        + coalesce(nf.sum_unverified_mins, 0)
    ) as ac_total_flight_time,

    (coalesce(validated.ajlb_total_flight_mins, minutes_at_start, 0) 
        + coalesce(nf.sum_unverified_mins, 0))/60.0 as ac_total_flight_hours,

    ceil((
        coalesce(validated.ajlb_row_number + (validated.ajlb_page_number - 1) * ajlb.rows_per_page, 0)
        + coalesce(nf.sum_unverified_flights, 0)
        + coalesce(nf.sum_empty_rows, 0)
    )/ajlb.rows_per_page::float)::int4 as pages_in_use,

    ceil((
        coalesce(validated.ajlb_row_number + (validated.ajlb_page_number - 1) * ajlb.rows_per_page, 0)
        + coalesce(nf.first_empty_rows + 1, 0)
    )/ajlb.rows_per_page::float)::int4 as new_flights_page_number,

    nf.sum_unverified_flights::int4 as new_flights_count,
    format_flight_time(nf.sum_unverified_mins) as new_flights_time

from flight.aircraft_journey_log_book as ajlb
left join last_validated as validated
    on ajlb.aircraft_registration = validated.aircraft_registration
    and ajlb.seq_no = validated.ajlb_seq_no
left join new_flights as nf
    on ajlb.aircraft_registration = nf.aircraft_registration
    and ajlb.seq_no = nf.ajlb_seq_no;