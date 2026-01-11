CREATE VIEW stats.total_flight_time_by_pilot AS
SELECT
    MD5(pic_member_id::TEXT) AS pilot,
    TO_TIMESTAMP(takeoff_time_epoch)::DATE AS date,
    COALESCE(SUM(flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(night_flying_mins), 0) AS total_nf_mins,
    COALESCE(SUM(instrument_flying_mins), 0) AS total_ifr_mins
FROM flight.logs
GROUP BY pilot, date;

CREATE VIEW stats.total_flight_time_by_pilot_yr AS
SELECT
    pilot,
    EXTRACT(YEAR FROM date) AS yr,
    COALESCE(SUM(total_flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(total_nf_mins), 0) AS total_nf_mins,
    COALESCE(SUM(total_ifr_mins), 0) AS total_ifr_mins
FROM stats.total_flight_time_by_pilot p
WHERE NOT EXISTS (
    SELECT 1
    FROM member.member_to_roles mtr
    WHERE  MD5(mtr.member_id::TEXT) = p.pilot
      AND mtr.role_id = 'INSTRUCTOR'
)
GROUP BY
    p.pilot,
    yr
ORDER BY
    yr DESC,
    total_flight_mins DESC;


CREATE VIEW stats.total_flight_time_by_pilot_yr_mth AS
SELECT
    pilot,    
    EXTRACT(YEAR FROM date) AS yr,
    EXTRACT(MONTH FROM date) AS mth,
    COALESCE(SUM(total_flight_mins), 0) AS total_flight_mins,
    COALESCE(SUM(total_nf_mins), 0) AS total_nf_mins,
    COALESCE(SUM(total_ifr_mins), 0) AS total_ifr_mins
FROM stats.total_flight_time_by_pilot
GROUP BY pilot, yr, mth;
