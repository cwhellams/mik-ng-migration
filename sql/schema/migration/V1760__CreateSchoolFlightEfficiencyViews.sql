-- V1760: School Flight Reservation Efficiency Views (issue #1081)
-- School flight reservation efficiency = block time flown / time reserved,
-- restricted to school (training) flights only.
--   - Reservation side: schedule.bookings.booking_type = 'TRAINING'
--   - Flight log side: flight.logs.flight_type IN ('SCHOOL', 'DTO')
-- Unlike the general Reservation Efficiency report (which uses logged airtime
-- from flight_mins/takeoff_time_epoch as the numerator), this report uses
-- block time (off-block to on-block) as the numerator, per the issue's own example.
-- As with the existing Reservation/Airfield Efficiency reports, there is no FK
-- between a reservation and the flight log it produced, so matching is only
-- possible at the aggregate level (by year/month/aircraft/instructor).

-- Overall efficiency by year
CREATE VIEW stats.school_flight_efficiency_by_yr AS
WITH reserved AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_type = 'TRAINING'
      AND booking_status != 'CANCELLED'
    GROUP BY yr
),
flown AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(off_block_time_epoch)) AS yr,
        COALESCE(SUM(block_mins), 0)::NUMERIC AS total_block_mins
    FROM flight.logs
    WHERE flight_type IN ('SCHOOL', 'DTO')
    GROUP BY yr
)
SELECT
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.total_block_mins, 0) AS total_block_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_block_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.yr = r.yr;

-- Overall efficiency by year and month
CREATE VIEW stats.school_flight_efficiency_by_yr_mth AS
WITH reserved AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(start_time_epoch)) AS mth,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_type = 'TRAINING'
      AND booking_status != 'CANCELLED'
    GROUP BY yr, mth
),
flown AS (
    SELECT
        EXTRACT(YEAR FROM TO_TIMESTAMP(off_block_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(off_block_time_epoch)) AS mth,
        COALESCE(SUM(block_mins), 0)::NUMERIC AS total_block_mins
    FROM flight.logs
    WHERE flight_type IN ('SCHOOL', 'DTO')
    GROUP BY yr, mth
)
SELECT
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.total_block_mins, 0) AS total_block_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_block_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.yr = r.yr AND f.mth = r.mth;

-- Efficiency by aircraft and year
CREATE VIEW stats.school_flight_efficiency_by_ac_yr AS
WITH reserved AS (
    SELECT
        registration AS aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_type = 'TRAINING'
      AND booking_status != 'CANCELLED'
    GROUP BY aircraft_registration, yr
),
flown AS (
    SELECT
        aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(off_block_time_epoch)) AS yr,
        COALESCE(SUM(block_mins), 0)::NUMERIC AS total_block_mins
    FROM flight.logs
    WHERE flight_type IN ('SCHOOL', 'DTO')
    GROUP BY aircraft_registration, yr
)
SELECT
    COALESCE(f.aircraft_registration, r.aircraft_registration) AS aircraft_registration,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.total_block_mins, 0) AS total_block_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_block_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.aircraft_registration = r.aircraft_registration AND f.yr = r.yr;

-- Efficiency by aircraft, year, and month
CREATE VIEW stats.school_flight_efficiency_by_ac_yr_mth AS
WITH reserved AS (
    SELECT
        registration AS aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(start_time_epoch)) AS mth,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_type = 'TRAINING'
      AND booking_status != 'CANCELLED'
    GROUP BY aircraft_registration, yr, mth
),
flown AS (
    SELECT
        aircraft_registration,
        EXTRACT(YEAR FROM TO_TIMESTAMP(off_block_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(off_block_time_epoch)) AS mth,
        COALESCE(SUM(block_mins), 0)::NUMERIC AS total_block_mins
    FROM flight.logs
    WHERE flight_type IN ('SCHOOL', 'DTO')
    GROUP BY aircraft_registration, yr, mth
)
SELECT
    COALESCE(f.aircraft_registration, r.aircraft_registration) AS aircraft_registration,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.total_block_mins, 0) AS total_block_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_block_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r
    ON f.aircraft_registration = r.aircraft_registration
    AND f.yr = r.yr
    AND f.mth = r.mth;

-- Efficiency by instructor and year (instructor_member_id is MD5 hashed for anonymization)
-- Reserved side: schedule.bookings.instructor_member_id (set on TRAINING bookings).
-- Flown side: no dedicated instructor column on flight.logs, so the instructor is
-- identified as whichever crew member (PIC or crew2-4) is logged with the FI (Flight
-- Instructor) crew role.
CREATE VIEW stats.school_flight_efficiency_by_instructor_yr AS
WITH reserved AS (
    SELECT
        MD5(instructor_member_id::TEXT) AS instructor,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_type = 'TRAINING'
      AND booking_status != 'CANCELLED'
      AND instructor_member_id IS NOT NULL
    GROUP BY instructor, yr
),
flown AS (
    SELECT
        MD5(instructor_member_id::TEXT) AS instructor,
        EXTRACT(YEAR FROM TO_TIMESTAMP(off_block_time_epoch)) AS yr,
        COALESCE(SUM(block_mins), 0)::NUMERIC AS total_block_mins
    FROM (
        SELECT
            off_block_time_epoch,
            block_mins,
            CASE
                WHEN pic_role = 'FI' THEN pic_member_id
                WHEN crew2_role = 'FI' THEN crew2_member_id
                WHEN crew3_role = 'FI' THEN crew3_member_id
                WHEN crew4_role = 'FI' THEN crew4_member_id
            END AS instructor_member_id
        FROM flight.logs
        WHERE flight_type IN ('SCHOOL', 'DTO')
    ) identified_flights
    WHERE instructor_member_id IS NOT NULL
    GROUP BY instructor, yr
)
SELECT
    COALESCE(f.instructor, r.instructor) AS instructor,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.total_block_mins, 0) AS total_block_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_block_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.instructor = r.instructor AND f.yr = r.yr;

-- Efficiency by instructor, year, and month (instructor_member_id is MD5 hashed for anonymization)
CREATE VIEW stats.school_flight_efficiency_by_instructor_yr_mth AS
WITH reserved AS (
    SELECT
        MD5(instructor_member_id::TEXT) AS instructor,
        EXTRACT(YEAR FROM TO_TIMESTAMP(start_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(start_time_epoch)) AS mth,
        COALESCE(SUM((end_time_epoch - start_time_epoch) / 60), 0) AS total_reserved_mins
    FROM schedule.bookings
    WHERE booking_type = 'TRAINING'
      AND booking_status != 'CANCELLED'
      AND instructor_member_id IS NOT NULL
    GROUP BY instructor, yr, mth
),
flown AS (
    SELECT
        MD5(instructor_member_id::TEXT) AS instructor,
        EXTRACT(YEAR FROM TO_TIMESTAMP(off_block_time_epoch)) AS yr,
        EXTRACT(MONTH FROM TO_TIMESTAMP(off_block_time_epoch)) AS mth,
        COALESCE(SUM(block_mins), 0)::NUMERIC AS total_block_mins
    FROM (
        SELECT
            off_block_time_epoch,
            block_mins,
            CASE
                WHEN pic_role = 'FI' THEN pic_member_id
                WHEN crew2_role = 'FI' THEN crew2_member_id
                WHEN crew3_role = 'FI' THEN crew3_member_id
                WHEN crew4_role = 'FI' THEN crew4_member_id
            END AS instructor_member_id
        FROM flight.logs
        WHERE flight_type IN ('SCHOOL', 'DTO')
    ) identified_flights
    WHERE instructor_member_id IS NOT NULL
    GROUP BY instructor, yr, mth
)
SELECT
    COALESCE(f.instructor, r.instructor) AS instructor,
    COALESCE(f.yr, r.yr) AS yr,
    COALESCE(f.mth, r.mth) AS mth,
    COALESCE(f.total_block_mins, 0) AS total_block_mins,
    COALESCE(r.total_reserved_mins, 0) AS total_reserved_mins,
    CASE
        WHEN COALESCE(r.total_reserved_mins, 0) > 0
        THEN ROUND(COALESCE(f.total_block_mins, 0) / r.total_reserved_mins * 100, 2)
        ELSE 0
    END AS efficiency_pct
FROM flown f
FULL OUTER JOIN reserved r ON f.instructor = r.instructor AND f.yr = r.yr AND f.mth = r.mth;
