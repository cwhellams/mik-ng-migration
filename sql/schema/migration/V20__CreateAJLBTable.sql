create table flight.aircraft_journey_log_book
(
    aircraft_registration varchar(10) not null references flight.aircraft (
        registration
    ),
    ajlb_seq_no smallint not null,
    no_of_pages smallint not null,
    rows_per_page smallint not null,
    start_page smallint not null,
    hours_at_start decimal(8, 2),
    ajlb_start_date date not null,
    constraint pk_ajlb primary key (aircraft_registration, ajlb_seq_no)
)
