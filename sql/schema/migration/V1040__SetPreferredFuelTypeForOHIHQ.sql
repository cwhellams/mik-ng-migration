-- Set MOGAS 98E5 as the preferred fuel type for OH-IHQ.
UPDATE flight.aircraft
SET preferred_fuel_type = 'MOGAS 98E5'
WHERE registration = 'OH-IHQ';

-- Set JET A-1 as the preferred fuel type for OH-STL.
UPDATE flight.aircraft
SET preferred_fuel_type = 'JET A-1'
WHERE registration = 'OH-STL';
