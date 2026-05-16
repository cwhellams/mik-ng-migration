-- V1010: Reservation Efficiency Views
-- Reservation efficiency = logged airtime / reserved time (non-cancelled bookings)
-- Efficiency % = (total_flight_mins / total_reserved_mins) * 100

-- Overall efficiency by year
CREATE VIEW stats.reservation_efficiency_by_yr AS
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
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY yr
)
SELECT
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.yr = r.yr;

-- Overall efficiency by year and month
CREATE VIEW stats.reservation_efficiency_by_yr_mth AS
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
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY yr, mth
)
SELECT
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.yr = r.yr AND f.mth = r.mth;

-- Efficiency by aircraft and year
CREATE VIEW stats.reservation_efficiency_by_ac_yr AS
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
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY aircraft_registration, yr
)
SELECT
    COALESCE(f.aircraft_registration, r.aircraft_registration) AS aircraft_registration,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.aircraft_registration = r.aircraft_registration AND f.yr = r.yr;

-- Efficiency by aircraft, year, and month
CREATE VIEW stats.reservation_efficiency_by_ac_yr_mth AS
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
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY aircraft_registration, yr, mth
)
SELECT
    COALESCE(f.aircraft_registration, r.aircraft_registration) AS aircraft_registration,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
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

-- Efficiency by member and year (member_id is MD5 hashed for anonymization)
CREATE VIEW stats.reservation_efficiency_by_member_yr AS
WITH reserved AS (
    SELECT
        MD5(member_id::TEXT) AS member,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_status != 'CANCELLED'
    GROUP BY member, yr
),
flown AS (
    SELECT
        MD5(pic_member_id::TEXT) AS member,
        EXTRACT(YEAR FROM TO_TIMESTAMP(takeoff_time_epoch)) AS yr,
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY member, yr
)
SELECT
    COALESCE(f.member, r.member) AS member,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.member = r.member AND f.yr = r.yr;

-- Efficiency by member, year, and month (member_id is MD5 hashed for anonymization)
CREATE VIEW stats.reservation_efficiency_by_member_yr_mth AS
WITH reserved AS (
    SELECT
        MD5(member_id::TEXT) AS member,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(start_time_epoch)) AS mth,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_status != 'CANCELLED'
    GROUP BY member, yr, mth
),
flown AS (
    SELECT
        MD5(pic_member_id::TEXT) AS member,
        EXTRACT(YEAR FROM TO_TIMESTAMP(takeoff_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(takeoff_time_epoch)) AS mth,
        COALESCE(SUM(flight_mins), 0)::NUMERIC AS total_flight_mins
    FROM flight.logs
    GROUP BY member, yr, mth
)
SELECT
    COALESCE(f.member, r.member) AS member,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_flight_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.member = r.member AND f.yr = r.yr AND f.mth = r.mth;
