import { sharedApi } from '../../hooks/useApi'
import type { FlightLog } from '@backend/routes/flight-log/models'

// A row the user started typing into but left as only whitespace -- unlike a genuinely
// empty (never touched) row, this must block submission rather than being silently
// dropped: an ACTIVE defect grounds the aircraft, so a blank one must never slip through.
export const hasBlankReportedDefect = (descriptions: string[]): boolean =>
  descriptions.some((description) => description.length > 0 && description.trim().length === 0)

// Mirrors LogbookPage's fallback for turning the "HH:MM" display string into raw
// minutes, since the flight-log create/update response doesn't carry the raw
// acTotalFlightMins field (only the list endpoint's per-entry shape does).
const parseAcTotalFlightMins = (acTotalFlightTime: string | null): number | undefined => {
  const [h, m] = (acTotalFlightTime ?? '').split(':')
  const hh = Number(h)
  const mm = Number(m)
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : undefined
}

// Creates one in-flight defect (anchored to `flightId`, rendered as an inline chip on
// that flight's row, same as the old per-row "Add in-flight defect" button) per
// non-blank description, called right after a flight log entry is saved from the
// "Report defects" section on both the classic form and the wizard.
export async function submitReportedDefects(
  flightId: string,
  descriptions: string[],
): Promise<void> {
  const trimmed = descriptions.map((description) => description.trim()).filter(Boolean)
  if (trimmed.length === 0) return

  const { data: flight } = await sharedApi.get<FlightLog>(`v1/flight-logs/${flightId}`)
  const flightMins = parseAcTotalFlightMins(flight.acTotalFlightTime)
  if (flightMins === undefined) return

  await Promise.all(
    trimmed.map((description) =>
      sharedApi.post('v1/defects', {
        aircraftRegistration: flight.aircraftRegistration,
        ajlbSeqNo: flight.ajlbSeqNo,
        flightId,
        description,
        flightMins,
        rows: 0,
      }),
    ),
  )
}
