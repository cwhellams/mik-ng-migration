CREATE VIEW flight.vw_aircraft_grounding_status AS
WITH hil_effective_due AS (
  SELECT
    h.hil_id,
    GREATEST(h.due_date, MAX(e.extension_due)) AS effective_due_date
  FROM flight.aircraft_hil h
  LEFT JOIN flight.aircraft_hil_extension e ON e.hil_id = h.hil_id
  GROUP BY h.hil_id, h.due_date
)
SELECT
  a.registration,
  COUNT(d.defect_id) FILTER (
    WHERE d.status = 'ACTIVE'
       OR (
         d.status = 'MOVED_TO_HIL'
         AND h.resolved_note_id IS NULL
         AND eff.effective_due_date < now()
       )
  ) AS open_defect_count
FROM flight.aircraft a
LEFT JOIN flight.defect d ON d.aircraft_registration = a.registration
LEFT JOIN flight.aircraft_hil h ON d.hil_id = h.hil_id
LEFT JOIN hil_effective_due eff ON eff.hil_id = h.hil_id
GROUP BY a.registration;
