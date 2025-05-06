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
export const validateTimeInput = (timeStr: string): boolean => {
  if (!timeStr || timeStr.length !== 4) return false

  const hours = parseInt(timeStr.substring(0, 2))
  const minutes = parseInt(timeStr.substring(2, 4))

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/**
 * Converts a HHMM time string to a dayjs object
 * If the time is earlier than the previous time, adds a day to handle cross-day flights
 */
export const timeStringToDayjs = (
  timeStr: string,
  baseDate: dayjs.Dayjs | null,
  previousTime: dayjs.Dayjs | null = null
): dayjs.Dayjs | null => {
  if (!timeStr || timeStr.length !== 4 || !baseDate) return null

  // Pad with zeros if needed
  const paddedTime = timeStr.padStart(4, '0')

  // Extract hours and minutes
  const hours = parseInt(paddedTime.substring(0, 2))
  const minutes = parseInt(paddedTime.substring(2, 4))

  // Validate hours and minutes
  if (hours > 23 || minutes > 59) return null

  // Create a date object with the provided date and time
  let result = baseDate.clone().hour(hours).minute(minutes).second(0)

  // If we have a previous time and this time is earlier, add a day
  if (previousTime && result.isBefore(previousTime)) {
    result = result.add(1, 'day')
  }

  return result
}

/**
 * Converts a time string to minutes for comparison
 */
export const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr.length !== 4) return -1
  const hours = parseInt(timeStr.substring(0, 2))
  const minutes = parseInt(timeStr.substring(2, 4))
  return hours * 60 + minutes
}

/**
 * Converts a HHMM string to a Date object
 */
export const parseTimeInput = (
  timeStr: string,
  date: dayjs.Dayjs | null,
  useUtcTime: boolean
): Date | null => {
  if (!timeStr || !date) return null

  // Pad with zeros if needed
  const paddedTime = timeStr.padStart(4, '0')

  // Extract hours and minutes
  const hours = parseInt(paddedTime.substring(0, 2))
  const minutes = parseInt(paddedTime.substring(2, 4))

  // Validate hours and minutes
  if (hours > 23 || minutes > 59) return null

  // Create a date object with the provided date and time
  const result = date.clone().hour(hours).minute(minutes).second(0)

  // Convert to UTC if needed
  return useUtcTime ? result.toDate() : result.local().toDate()
}
