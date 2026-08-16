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

  // getTimezoneOffset() counts minutes *behind* UTC, so the summer (more
  // easterly) offset is the smaller number and this shift is negative when
  // moving from a summer "now" to a winter flight date.
  const offsetShiftMinutes =
    currentTime.toDate().getTimezoneOffset() - referenceDate.toDate().getTimezoneOffset()

  return currentTime.add(offsetShiftMinutes, 'minute').format('HH:mm')
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
