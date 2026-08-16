import type { Dayjs } from 'dayjs'

// Imported from utils/date rather than 'dayjs' directly: `.utc()` below only
// exists once the utc plugin has been registered, and utils/date is where that
// happens. Importing plain dayjs worked only as a side effect of App.tsx pulling
// utils/date in first, which is not something this module should rely on.
import { dayjs } from '../../../utils/date'

/**
 * Returns the current time as an example, either in UTC or in the local offset
 * that applies on the selected flight date.
 *
 * The flight date matters because the local offset moves with DST: the same
 * instant reads 12:15 on a summer date and 11:15 on a winter one. Ignoring it
 * would put the example out of step with the `UTC+3`/`UTC+2` label that
 * getTimezoneDisplay renders beside it.
 */
export const getTimeExample = (useUtcTime: boolean, flightDate: Dayjs | null): string => {
  const currentTime = dayjs()

  if (useUtcTime) {
    // For UTC, we just need the current time in UTC
    return currentTime.utc().format('HH:mm')
  }

  // Use flight date if selected, otherwise use today
  const referenceDate = flightDate || currentTime

  // getTimezoneOffset() counts minutes *behind* UTC, so negate it to get minutes
  // ahead — the offset in force on the flight date, which is what the field is
  // labelled with.
  const offsetMinutes = -referenceDate.toDate().getTimezoneOffset()

  // Added to the UTC instant and formatted in UTC mode, deliberately. Shifting a
  // local-mode dayjs and formatting it would re-apply whatever offset holds at
  // the *shifted* instant: within the hour before a DST transition the shift
  // carries the instant past it, and the hour gets counted twice (02:30 local on
  // a spring-forward morning read 04:30 instead of 03:30).
  return currentTime.utc().add(offsetMinutes, 'minute').format('HH:mm')
}

/**
 * Returns the timezone display string (e.g., "UTC+3")
 */
export const getTimezoneDisplay = (useUtcTime: boolean, flightDate: Dayjs | null): string => {
  if (useUtcTime) {
    return 'UTC'
  }

  // Use flight date if selected, otherwise use today
  const referenceDate = flightDate?.toDate() || new Date()
  const offset = referenceDate.getTimezoneOffset() / -60
  const sign = offset >= 0 ? '+' : ''

  return `UTC${sign}${offset}`
}
