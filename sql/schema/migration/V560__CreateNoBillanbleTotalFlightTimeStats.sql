CREATE VIEW stats.non_billable_total_flight_time_by_ac AS
SELECT
    aircraft_registration,
    flight_type,
    TO_TIMESTAMP(takeoff_time_epoch)::DATE AS date,
    COALESCE(SUM(flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(night_flying_mins), 0) AS total_nf_mins,
    COALESCE(SUM(instrument_flying_mins), 0) AS total_ifr_mins
FROM flight.logs
WHERE is_billable_flight = FALSE
GROUP BY aircraft_registration, flight_type, date;

CREATE VIEW stats.non_billable_total_flight_time_by_ac_yr AS
SELECT
    aircraft_registration,
    flight_type,
    EXTRACT(YEAR FROM date) AS yr,
    COALESCE(SUM(total_flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(total_nf_mins), 0) AS total_nf_mins,
    COALESCE(SUM(total_ifr_mins), 0) AS total_ifr_mins
FROM stats.non_billable_total_flight_time_by_ac
GROUP BY aircraft_registration, flight_type, yr;

CREATE VIEW stats.non_billable_total_flight_time_by_ac_yr_mth AS
SELECT
    aircraft_registration,
    flight_type,
    EXTRACT(YEAR FROM date) AS yr,
    EXTRACT(MONTH FROM date) AS mth,
    COALESCE(SUM(total_flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(total_nf_mins), 0) AS total_nf_mins,
    COALESCE(SUM(total_ifr_mins), 0) AS total_ifr_mins
FROM stats.non_billable_total_flight_time_by_ac
GROUP BY aircraft_registration, flight_type, yr, mth;
