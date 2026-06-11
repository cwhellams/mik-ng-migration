-- Fix invalid flight_type 'LOCAL' inserted by V201; replace with valid type 'PRIVATE'
UPDATE flight.logs
SET flight_type = 'PRIVATE'
WHERE flight_id IN ('blnkrow01', 'blnkrow02', 'blnkrow03')
  AND flight_type = 'LOCAL';
