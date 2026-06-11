import dayjs from 'dayjs'

export const getDurationInMinutes = (start: string, end?: string): number =>
  dayjs(end).diff(start, 'minute')

export const formatDuration = (minutes: number, hideZeros = false): string => {
  if (minutes <= 0) return '--'
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60

  return [hrs > 0 && `${hrs}h`, (mins > 0 || !hideZeros) && `${mins}min`].filter(Boolean).join(' ')
}

export const durationToDayjs = (minutes: number): dayjs.Dayjs => {
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return dayjs().hour(hrs).minute(mins)
}

/**
 * Create next time after previous time.
 * If the time is earlier than the previous time,
 * adds a day to handle cross-day flights. Similarily if time is
 * over 24h, subtract a day to keep them reasonable.
 */
export const calculateNext = (previous: dayjs.Dayjs, time: dayjs.Dayjs) => {
  const max = previous.add(24, 'hours')

  // copy current time to the date
  const dateTime = previous.hour(time.hour()).minute(time.minute()).second(0)

  // add or remove a day to keep timestamps in chronological order
  return dateTime.isBefore(previous)
    ? dateTime.add(24, 'hours')
    : dateTime.isAfter(max)
      ? dateTime.subtract(24, 'hours')
      : dateTime
}

export const splitTime = (hhMM: string) => {
  const [hours, minutes] = hhMM.split(':')
  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}
