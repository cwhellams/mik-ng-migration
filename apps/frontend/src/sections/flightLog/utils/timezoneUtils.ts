import dayjs from 'dayjs'

/**
 * Returns current time example in either UTC or local time with DST consideration
 */
export const getTimeExample = (useUtcTime: boolean, flightDate: dayjs.Dayjs | null): string => {
  const currentTime = dayjs()
  const currentHour = currentTime.hour()
  const currentMinute = currentTime.minute()

  if (useUtcTime) {
    // For UTC, we just need the current time in UTC
    return currentTime.utc().format('HH:mm')
  } else {
    // Use flight date if selected, otherwise use today
    const referenceDate = flightDate || currentTime

    // For local time, we need to use the selected date to account for DST
    // but with current time
    return referenceDate.hour(currentHour).minute(currentMinute).format('HH:mm')
  }
}

/**
 * Returns the timezone display string (e.g., "UTC+3")
 */
export const getTimezoneDisplay = (useUtcTime: boolean, flightDate: dayjs.Dayjs | null): string => {
  if (useUtcTime) {
    return 'UTC'
  }

  // Use flight date if selected, otherwise use today
  const referenceDate = flightDate?.toDate() || new Date()
  const offset = referenceDate.getTimezoneOffset() / -60
  const sign = offset >= 0 ? '+' : ''

  return `UTC${sign}${offset}`
}
