INSERT INTO flight.aircraft_journey_log_book (
    aircraft_registration,
    seq_no,
    no_of_pages,
    rows_per_page,
    start_page,
    minutes_at_start,
    start_date,
    end_date
) VALUES
('OH-STL', 1, 100, 25, 1, 610, '2023-04-01', '2024-04-02'),
('OH-STL', 2, 120, 30, 101, 10020, '2024-04-02', '2025-04-02'),
('OH-STL', 3, 120, 30, 101, 287000, '2025-04-02', null),
('OH-IHQ', 1, 80, 20, 1, 2445, '2024-04-03', '2025-04-04'),
('OH-IHQ', 2, 90, 25, 81, 367000, '2025-04-04', null),
('OH-P28', 4, 90, 25, 81, 313700, '2003-04-04', null);
