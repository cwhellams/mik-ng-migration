UPDATE flight.aircraft SET
  last_maintenance_tach = last_maintenance_tach * 60,
  next_maintenance_tach = next_maintenance_tach * 60;

ALTER TABLE flight.aircraft DROP COLUMN hourly_rate_eur;

ALTER TABLE flight.aircraft RENAME COLUMN last_maintenance_tach TO last_maintenance_mins;

ALTER TABLE flight.aircraft RENAME COLUMN next_maintenance_tach TO next_maintenance_mins;
