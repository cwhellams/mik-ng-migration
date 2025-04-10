INSERT INTO flight.aircraft_journey_log_book (
    aircraft_registration,
    ajlb_seq_no,
    no_of_pages,
    rows_per_page,
    start_page,
    hours_at_start,
    ajlb_start_date
) VALUES
('OH-STL', 1, 100, 25, 1, 5.00, '2025-04-01'),
('OH-STL', 2, 120, 30, 101, 10.50, '2025-04-02'),
('OH-STL', 3, 120, 30, 101, 10.50, '2025-04-02'),
('OH-IHQ', 1, 80, 20, 1, 3.25, '2025-04-03'),
('OH-IHQ', 2, 90, 25, 81, 7.75, '2025-04-04'),
('OH-P28', 4, 90, 25, 81, 7.75, '2025-04-04');
