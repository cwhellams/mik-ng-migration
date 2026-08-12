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

/** Convert a Unix-epoch-seconds string (as stored on bookings and flights) to Helsinki time. */
export const epochToHelsinki = (epoch: string): Dayjs => toHelsinki(dayjs.unix(Number(epoch)))
