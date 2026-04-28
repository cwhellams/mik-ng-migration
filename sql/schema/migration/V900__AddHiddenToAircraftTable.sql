-- Add hidden column to aircraft table to allow hiding aircraft from the aircraft view
-- Hidden aircraft (e.g. simulators or virtual aircraft) are not shown in the aircraft list
-- but can still be booked. Admins can see and manage hidden aircraft.
ALTER TABLE flight.aircraft ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
