CREATE VIEW stats.total_flight_time_by_ac_dt AS
SELECT
    aircraft_registration,
    TO_TIMESTAMP(takeoff_time_epoch)::DATE AS date,
    COALESCE(SUM(flight_mins), 0) AS total_flight_mins
FROM flight.logs
GROUP BY aircraft_registration, date;

CREATE VIEW stats.total_flight_time_by_ac_ft AS
SELECT
    aircraft_registration,
    flight_type,
    TO_TIMESTAMP(takeoff_time_epoch)::DATE AS date,
    COALESCE(SUM(flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(night_flying_mins), 0) AS total_nf_mins,
    COALESCE(SUM(instrument_flying_mins), 0) AS total_ifr_mins
FROM flight.logs
GROUP BY aircraft_registration, flight_type, date;

CREATE VIEW stats.total_flight_time_by_ac_yr_ft AS
SELECT
    aircraft_registration,
    flight_type,
    EXTRACT(YEAR FROM date) AS yr,
    COALESCE(SUM(total_flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(total_nf_mins), 0) AS total_nf_mins,
    COALESCE(SUM(total_ifr_mins), 0) AS total_ifr_mins
FROM stats.total_flight_time_by_ac_ft
GROUP BY aircraft_registration, flight_type, yr;

CREATE VIEW stats.total_flight_time_by_ac_yr AS
SELECT
    aircraft_registration,
    EXTRACT(YEAR FROM to_timestamp(takeoff_time_epoch)) AS yr,
    COALESCE(SUM(flight_mins), 0) AS total_flight_mins
FROM flight.logs
GROUP BY aircraft_registration,  yr;

CREATE VIEW stats.total_flight_time_by_ac_yr_mth_ft AS
SELECT
    aircraft_registration,
    flight_type,
    EXTRACT(YEAR FROM date) AS yr,
    EXTRACT(MONTH FROM date) AS mth,
    COALESCE(SUM(total_flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(total_nf_mins), 0) AS total_nf_mins,
    COALESCE(SUM(total_ifr_mins), 0) AS total_ifr_mins
FROM stats.total_flight_time_by_ac_ft
GROUP BY aircraft_registration, flight_type, yr, mth;
