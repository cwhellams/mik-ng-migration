ALTER TABLE flight.aircraft_journey_log_book
ADD COLUMN start_landings INT NOT NULL DEFAULT 0 CHECK (start_landings >= 0);
