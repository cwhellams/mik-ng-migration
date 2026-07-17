-- AOG (Aircraft On Ground) statistics: an aircraft is considered AOG on any calendar day
-- it was booked out for maintenance, or had an outstanding (unresolved) defect logged
-- against it.
--
-- Simplification: a defect's "unserviceable" window is modelled as running from its
-- creation until it is marked RESOLVED (or "now" if still open), even if part of that
-- time was spent deferred on the Hold Item List rather than strictly grounding the
-- aircraft. This keeps the model simple; flight.defect_audit has the exact
-- status-transition timestamps if finer precision is ever needed.

CREATE VIEW stats.aog_intervals AS
SELECT
    registration AS aircraft_registration,
    'MAINTENANCE' AS reason,
    start_time_utc AS from_ts,
    end_time_utc AS to_ts
FROM schedule.bookings
WHERE booking_type = 'MAINTENANCE'
  AND booking_status != 'CANCELLED'

UNION ALL

SELECT
    aircraft_registration,
    'UNSERVICEABLE' AS reason,
    created_at AS from_ts,
    COALESCE(
        CASE WHEN status = 'RESOLVED' THEN updated_at END,
        now()
    ) AS to_ts
FROM flight.defect;

CREATE VIEW stats.aog_days_by_ac_dt AS
SELECT DISTINCT
    aircraft_registration,
    reason,
    day::DATE AS date
FROM stats.aog_intervals,
    generate_series(date_trunc('day', from_ts), date_trunc('day', to_ts), interval '1 day') AS day;

CREATE VIEW stats.aog_days_by_ac_yr_mth AS
SELECT
    aircraft_registration,
    EXTRACT(YEAR FROM date) AS yr,
    EXTRACT(MONTH FROM date) AS mth,
    COUNT(DISTINCT date) FILTER (WHERE reason = 'MAINTENANCE') AS maintenance_days,
    COUNT(DISTINCT date) FILTER (WHERE reason = 'UNSERVICEABLE') AS unserviceable_days,
    COUNT(DISTINCT date) AS total_aog_days
FROM stats.aog_days_by_ac_dt
GROUP BY aircraft_registration, yr, mth;

CREATE VIEW stats.aog_days_by_ac_yr AS
SELECT
    aircraft_registration,
    yr,
    SUM(maintenance_days) AS maintenance_days,
    SUM(unserviceable_days) AS unserviceable_days,
    SUM(total_aog_days) AS total_aog_days
FROM stats.aog_days_by_ac_yr_mth
GROUP BY aircraft_registration, yr;
