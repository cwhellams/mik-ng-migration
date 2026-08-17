/**
 * Saving an ICS file from the browser — the part of calendar export that is not
 * about calendars at all.
 *
 * `calendarEvent.ts` (bookings) and `eventCalendar.ts` (club events) each carried
 * their own byte-identical copy of the blob/anchor/revoke dance and of
 * `sanitizeFilenamePart`, alongside the ICS-building duplication that issue #1115
 * finding 8 is about. The building moved to `@mik/contracts/calendar`, shared with
 * the backend's mailed invites; this is the browser half, which the backend has no
 * use for and so cannot live there.
 */

/** Anything outside `[A-Za-z0-9._-]` becomes `_`, so a title can't shape the filename. */
export const sanitizeFilenamePart = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]/g, '_')

/**
 * Offers `ics` to the user as a download named `filename`.
 *
 * The object URL is revoked immediately after the synthetic click: the browser has
 * already taken its own reference to the blob by then, and not revoking it leaks
 * the blob for the lifetime of the document.
 */
export const saveIcsFile = (ics: string, filename: string): void => {
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
