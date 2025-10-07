create table flight.aircraft_journey_log_book (
    aircraft_registration varchar(10) not null references flight.aircraft (registration),
    seq_no smallint not null,
    no_of_pages smallint not null,
    rows_per_page smallint not null,
    start_page smallint not null,
    start_flight_mins int not null,
    start_flight_time text generated always as (format_flight_time(start_flight_mins)) stored not null,
    -- You can use "virtual" instead of "stored" if you don't want to store the value physically
    start_date date not null,
    end_date date,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    constraint pk_ajlb primary key (aircraft_registration, seq_no),
    constraint chk_start_flight_mins check (start_flight_mins >= 0)
);