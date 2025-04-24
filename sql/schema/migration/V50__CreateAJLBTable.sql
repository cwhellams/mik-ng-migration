create table flight.aircraft_journey_log_book
(
    aircraft_registration varchar(10) not null references flight.aircraft (
        registration
    ),
    seq_no smallint not null,
    no_of_pages smallint not null,
    rows_per_page smallint not null,
    start_page smallint not null,
    minutes_at_start int not null,
    flight_time text generated always as (
        floor(minutes_at_start / 60)
        || ':'
        || lpad((minutes_at_start % 60)::text, 2, '0')
    ) stored not null,  -- You can use "virtual" instead of "stored" if you don't want to store the value physically
    start_date date not null,
    end_date date,
    constraint pk_ajlb primary key (aircraft_registration, seq_no),
    constraint chk_minutes_at_start check (minutes_at_start >= 0)
);
