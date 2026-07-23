-- Occupancy (persons-on-board) distribution per aircraft/year, restricted to aircraft
-- that actually have more than 2 seats (currently only OH-STL) since a 1-2 seat
-- aircraft can never carry 3+ people on board.
-- A flight is treated as cross-country when it lands somewhere other than where it
-- took off (departure_airport <> arrival_airport) — there is no dedicated flag for
-- this on flight.logs.
CREATE VIEW stats.pob_distribution_by_ac_yr AS
SELECT
    l.aircraft_registration,
    EXTRACT(YEAR FROM to_timestamp(l.takeoff_time_epoch)) AS yr,
    CASE
        WHEN l.persons_on_board >= 4 THEN '4_PLUS'
        WHEN l.persons_on_board = 3 THEN '3'
        ELSE '1_2'
    END AS pob_bucket,
    COUNT(*) AS flight_count,
    COUNT(*) FILTER (WHERE l.departure_airport != l.arrival_airport) AS cross_country_flight_count,
    COALESCE(SUM(l.flight_mins), 0) AS total_flight_mins
FROM flight.logs l
JOIN flight.aircraft a ON a.registration = l.aircraft_registration
WHERE a.seats > 2
GROUP BY l.aircraft_registration, yr, pob_bucket;
