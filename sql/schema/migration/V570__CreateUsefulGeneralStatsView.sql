CREATE VIEW stats.visited_airfields_by_ac AS
WITH cte_visited_airfields AS (
    SELECT
        aircraft_registration,
        EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
        departure_airport AS airfield,
        COUNT(departure_airport) AS visits
    FROM flight.logs
    GROUP BY aircraft_registration, yr, departure_airport
    UNION
    SELECT DISTINCT
        aircraft_registration,
        EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
        arrival_airport AS airfield,
        COUNT(arrival_airport) AS visits
    FROM flight.logs
    GROUP BY aircraft_registration, yr, arrival_airport
)
SELECT
    aircraft_registration,
    yr,
    airfield,
    COALESCE(SUM(visits), 0) AS total_visits
FROM cte_visited_airfields
GROUP BY aircraft_registration, yr, airfield;

CREATE VIEW stats.total_landings_by_ac_yr AS
SELECT
    aircraft_registration,
    EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
    COALESCE(SUM(number_of_landings), 0) AS total_landings
FROM flight.logs
GROUP BY aircraft_registration, yr;

CREATE VIEW stats.total_oil_uplift_by_ac_yr_mth AS
SELECT
    aircraft_registration,
    EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
    EXTRACT(MONTH FROM to_timestamp(takeoff_time_epoch)) AS mth,
    COALESCE(SUM(oil_uplift_litres), 0) AS total_oil_uplift
FROM flight.logs
GROUP BY aircraft_registration, yr, mth;

CREATE VIEW stats.total_fuel_uplift_by_ac_yr_mth AS
SELECT
    aircraft_registration,
    EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
    EXTRACT(MONTH FROM to_timestamp(takeoff_time_epoch)) AS mth,
    COALESCE(SUM(fuel_uplift_litres), 0) AS total_fuel_uplift
FROM flight.logs
GROUP BY aircraft_registration, yr, mth;

CREATE VIEW stats.longest_shortest_avg_flight_by_ac_yr AS
SELECT
    aircraft_registration,
    EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
    COALESCE(MAX(flight_mins), 0) AS longest_flight,
    COALESCE(MIN(flight_mins), 0) AS shortest_flight,
    COALESCE(ROUND(AVG(flight_mins), 2), 0) AS average_flight,
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY flight_mins), 0) AS median_flight
FROM flight.logs
GROUP BY aircraft_registration, yr;

CREATE VIEW stats.member_count_by_type AS
SELECT
    member_type,
    COUNT(1) AS member_count
FROM member.register
WHERE member_type NOT IN ('REMOVED', 'SYSTEM')
GROUP BY member_type;