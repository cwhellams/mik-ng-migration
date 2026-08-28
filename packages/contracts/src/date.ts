import dayjs, { type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

// The club's operating timezone. Both apps had their own copy of this constant and
// of the conversion below — the backend called it `toLocal`, the frontend
// `toHelsinki` — so a change to one was invisible to the other (issue #1115,
// finding 8). Everything the club schedules (bookings, flights, occurrences) is
// stated in Helsinki wall-clock time regardless of where the reader is.
export const HELSINKI_TIMEZONE = 'Europe/Helsinki'

/** Convert any dayjs-parseable value to Helsinki wall-clock time. */
export const toHelsinki = (value: Dayjs | string | Date): Dayjs =>
  dayjs(value).tz(HELSINKI_TIMEZONE)

/**
 * The Helsinki calendar date an instant falls on, as `YYYY-MM-DD`; today when called
 * with no argument.
 *
 * How the journey log book's `recorded_on` dates are derived (#1254). Deliberately not
 * Postgres' `CURRENT_DATE`: the backend pool pins its sessions to `timezone=UTC` (see
 * `db/connection.ts`), so the database's idea of "today" rolls over at 02:00/03:00
 * Helsinki and a note entered late on a summer evening would be filed under tomorrow.
 */
export const toHelsinkiDate = (at: Dayjs | string | Date = dayjs()): string =>
  toHelsinki(at).format('YYYY-MM-DD')

/** Convert a Unix-epoch-seconds string (as stored on bookings and flights) to Helsinki time. */
export const epochToHelsinki = (epoch: string): Dayjs => toHelsinki(dayjs.unix(Number(epoch)))
