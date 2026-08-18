import { sharedApi } from '../../hooks/useApi'

// A row the user started typing into but left as only whitespace. Mirrors
// hasBlankReportedDefect -- dropped silently would look like the app ate their input.
export const hasBlankReportedRemark = (descriptions: string[]): boolean =>
  descriptions.some((description) => description.length > 0 && description.trim().length === 0)

// Creates one remark per non-blank description, called right after a flight log entry
// is saved from the "Report remarks" section on both the classic form and the wizard.
// Unlike submitReportedDefects, a remark carries no logbook placement (no aircraft
// registration, ajlbSeqNo or flightMins to look up), so it can post directly.
export async function submitReportedRemarks(
  flightId: string,
  descriptions: string[],
): Promise<void> {
  const trimmed = descriptions.map((description) => description.trim()).filter(Boolean)
  if (trimmed.length === 0) return

  await Promise.all(
    trimmed.map((description) => sharedApi.post('v1/remarks', { flightId, description })),
  )
}
