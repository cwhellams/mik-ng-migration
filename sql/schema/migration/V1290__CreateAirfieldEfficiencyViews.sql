-- V1290: Airfield Efficiency Views
-- Splits reservation-matched flight time into three categories:
--   efnu_efnu       = both departure_airport and arrival_airport = 'EFNU'
--   inbound_outbound = exactly one of departure/arrival = 'EFNU'
--   away            = neither departure nor arrival = 'EFNU'

-- Overall airfield efficiency by year
CREATE VIEW stats.airfield_efficiency_by_yr AS
WITH reserved AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_status != 'CANCELLED'
    GROUP BY yr
),
flown AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(takeoff_time_epoch)) AS yr,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport = 'EFNU' AND arrival_airport = 'EFNU'
        ), 0)::NUMERIC AS efnu_efnu_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE (departure_airport = 'EFNU') <> (arrival_airport = 'EFNU')
        ), 0)::NUMERIC AS inbound_outbound_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport != 'EFNU' AND arrival_airport != 'EFNU'
        ), 0)::NUMERIC AS away_mins,
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY yr
)
SELECT
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.efnu_efnu_mins, 0) AS efnu_efnu_mins,
    COALESCE(f.inbound_outbound_mins, 0) AS inbound_outbound_mins,
    COALESCE(f.away_mins, 0) AS away_mins,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.yr = r.yr;

-- Overall airfield efficiency by year and month
CREATE VIEW stats.airfield_efficiency_by_yr_mth AS
WITH reserved AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(start_time_epoch)) AS mth,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_status != 'CANCELLED'
    GROUP BY yr, mth
),
flown AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(takeoff_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(takeoff_time_epoch)) AS mth,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport = 'EFNU' AND arrival_airport = 'EFNU'
        ), 0)::NUMERIC AS efnu_efnu_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE (departure_airport = 'EFNU') <> (arrival_airport = 'EFNU')
        ), 0)::NUMERIC AS inbound_outbound_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport != 'EFNU' AND arrival_airport != 'EFNU'
        ), 0)::NUMERIC AS away_mins,
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY yr, mth
)
SELECT
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.efnu_efnu_mins, 0) AS efnu_efnu_mins,
    COALESCE(f.inbound_outbound_mins, 0) AS inbound_outbound_mins,
    COALESCE(f.away_mins, 0) AS away_mins,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.yr = r.yr AND f.mth = r.mth;

-- Airfield efficiency by aircraft and year
CREATE VIEW stats.airfield_efficiency_by_ac_yr AS
WITH reserved AS (
    SELECT
        registration AS aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_status != 'CANCELLED'
    GROUP BY aircraft_registration, yr
),
flown AS (
    SELECT
        aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(takeoff_time_epoch)) AS yr,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport = 'EFNU' AND arrival_airport = 'EFNU'
        ), 0)::NUMERIC AS efnu_efnu_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE (departure_airport = 'EFNU') <> (arrival_airport = 'EFNU')
        ), 0)::NUMERIC AS inbound_outbound_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport != 'EFNU' AND arrival_airport != 'EFNU'
        ), 0)::NUMERIC AS away_mins,
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY aircraft_registration, yr
)
SELECT
    COALESCE(f.aircraft_registration, r.aircraft_registration) AS aircraft_registration,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.efnu_efnu_mins, 0) AS efnu_efnu_mins,
    COALESCE(f.inbound_outbound_mins, 0) AS inbound_outbound_mins,
    COALESCE(f.away_mins, 0) AS away_mins,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.aircraft_registration = r.aircraft_registration AND f.yr = r.yr;

-- Airfield efficiency by aircraft, year, and month
CREATE VIEW stats.airfield_efficiency_by_ac_yr_mth AS
WITH reserved AS (
    SELECT
        registration AS aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(start_time_epoch)) AS mth,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_status != 'CANCELLED'
    GROUP BY aircraft_registration, yr, mth
),
flown AS (
    SELECT
        aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(takeoff_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(takeoff_time_epoch)) AS mth,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport = 'EFNU' AND arrival_airport = 'EFNU'
        ), 0)::NUMERIC AS efnu_efnu_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE (departure_airport = 'EFNU') <> (arrival_airport = 'EFNU')
        ), 0)::NUMERIC AS inbound_outbound_mins,
        COALESCE(SUM(flight_mins) FILTER (
            WHERE departure_airport != 'EFNU' AND arrival_airport != 'EFNU'
        ), 0)::NUMERIC AS away_mins,
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY aircraft_registration, yr, mth
)
SELECT
    COALESCE(f.aircraft_registration, r.aircraft_registration) AS aircraft_registration,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.efnu_efnu_mins, 0) AS efnu_efnu_mins,
    COALESCE(f.inbound_outbound_mins, 0) AS inbound_outbound_mins,
    COALESCE(f.away_mins, 0) AS away_mins,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r
    ON f.aircraft_registration = r.aircraft_registration
    AND f.yr = r.yr
    AND f.mth = r.mth;
