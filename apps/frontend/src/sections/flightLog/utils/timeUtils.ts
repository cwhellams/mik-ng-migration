import dayjs from 'dayjs'

/**
 * Formats raw time input to ensure it only contains digits and has max 4 characters
 */
export const formatTimeInput = (value: string): string => {
  // Only allow digits
  const digitsOnly = value.replace(/\D/g, '')

  // Limit to 4 digits
  return digitsOnly.slice(0, 4)
}

/**
 * Validates if a time string is in valid HHMM format
 */
export const validateTimeInput = (
  timeStr: string
): { hours?: number; minutes?: number; error?: string } => {
  if (!timeStr || timeStr.length !== 4) return { error: undefined }

  // Extract hours and minutes
  const hours = parseInt(timeStr.substring(0, 2))
  const minutes = parseInt(timeStr.substring(2, 4))

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? { hours, minutes }
    : { error: 'flightLog.invalidTimeFormat' }
}

/**
 * Converts a HHMM time string to a dayjs object
 * If the time is earlier than the previous time, adds a day to handle cross-day flights.
 * Optionally validate against a maximum number of minutes from the previous time
 * (having 23h taxi time is not reasonable, but 2359 to 0001 is).
 */
export const timeStringToDayjs = (
  timeStr: string,
  previousTime: dayjs.Dayjs,
  maxMinutes?: number
): { date?: dayjs.Dayjs; error?: string } => {
  const { hours, minutes, error } = validateTimeInput(timeStr)
  if (hours == undefined || minutes == undefined) {
    return { error }
  }

  // Create a date object with the provided date and time
  const baseline = previousTime.clone()
  let date = baseline.hour(hours).minute(minutes).second(0)

  // If we have a previous time and this time is earlier, add a day
  if (previousTime && date.isBefore(previousTime)) {
    date = date.add(1, 'day')
  }

  if (maxMinutes) {
    const diff = date.diff(previousTime, 'minutes')
    if (diff == 0 || diff > maxMinutes) {
      return { date, error: 'flightLog.invalidTime' }
    }
  }

  return { date }
}

// Converts a dayjs object to a HHMM time string
export const toTimeString = (time: dayjs.Dayjs, isUtc: boolean): string => {
  return isUtc ? time.utc().format('HHmm') : time.utc().format('HHmm')
}

export const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return '--'
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`
}
