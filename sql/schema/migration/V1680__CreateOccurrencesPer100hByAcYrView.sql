-- Safety performance indicator: occurrences per 100 flight hours, per aircraft per year.
--
-- Each report has an anonymized copy (see the RECEIVED transition in
-- apps/backend/src/routes/occurrences/api.ts): the original row moves to status
-- RECEIVED and stays there, while a new row is created for the copy and progresses
-- through ANONYMIZING/ANONYMIZED/PROCESSED/CLOSED. Both rows share the same
-- linked_report_id pair, so to count each safety event once we keep the row unless
-- it's the copy (linked_report_id set and status not RECEIVED).
CREATE VIEW stats.occurrences_per_100h_by_ac_yr AS
SELECT
    o.registration AS aircraft_registration,
    EXTRACT(YEAR FROM o.occurrence_date) AS yr,
    COUNT(*) AS occurrence_count,
    COALESCE(f.total_flight_mins, 0) AS total_flight_mins,
    CASE
        WHEN COALESCE(f.total_flight_mins, 0) = 0 THEN NULL
        ELSE ROUND(COUNT(*) * 100.0 / (f.total_flight_mins / 60.0), 2)
    END AS occurrences_per_100h
FROM flight.occurrences o
LEFT JOIN stats.total_flight_time_by_ac_yr f
    ON f.aircraft_registration = o.registration
    AND f.yr = EXTRACT(YEAR FROM o.occurrence_date)
WHERE o.status != 'DELETED'
  AND (o.linked_report_id IS NULL OR o.status = 'RECEIVED')
GROUP BY o.registration, EXTRACT(YEAR FROM o.occurrence_date), f.total_flight_mins;
