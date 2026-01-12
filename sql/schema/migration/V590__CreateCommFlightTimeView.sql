CREATE VIEW stats.total_commercial_flight_time_by_ac_yr_mth AS
SELECT
    aircraft_registration,
    EXTRACT(year FROM to_timestamp(takeoff_time_epoch::double precision)::date) AS yr,
    EXTRACT(month FROM to_timestamp(takeoff_time_epoch::double precision)::date) AS mth,
    COALESCE(sum(flight_mins), 0::bigint) AS total_commercial_flight_mins
FROM
    flight.logs
WHERE
    priv_or_com_flight = 'C'
GROUP BY
    aircraft_registration,
    yr,
    mth;