CREATE UNIQUE INDEX ux_one_open_ajlb_per_aircraft
ON flight.aircraft_journey_log_book (aircraft_registration)
WHERE end_date IS NULL;
