INSERT INTO flight.aircraft_journey_log_book (
    aircraft_registration,
    seq_no,
    no_of_pages,
    rows_per_page,
    start_page,
    start_flight_mins,
    start_date,
    end_date,
    created_by,
    updated_by
) VALUES
('OH-STL', 1, 100, 12, 1, 610, '2023-04-01', '2024-04-02', 'k1mnimda', 'k1mnimda'),
('OH-STL', 2, 120, 11, 10, 286700, '2024-04-02', null, 'k1mnimda', 'k1mnimda'),
('OH-IHQ', 1, 80, 11, 1, 2445, '2024-04-03', '2025-04-04', 'k1mnimda', 'k1mnimda'),
('OH-IHQ', 2, 90, 11, 81, 367000, '2025-04-04', null, 'k1mnimda', 'k1mnimda'),
('OH-P28', 4, 90, 10, 81, 313700, '2003-04-04', null, 'k1mnimda', 'k1mnimda');
