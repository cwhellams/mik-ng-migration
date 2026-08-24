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
 * Create next time after previous time. If the wall-clock time is earlier than
 * the previous timestamp, adds a day to handle cross-day flights.
 *
 * The result can never land more than 24h after `previous`: setting only the
 * hour and minute keeps it on `previous`'s own calendar day, so the +24h arm
 * takes it to at most the same clock time the next day.
 */
export const calculateNext = (previous: dayjs.Dayjs, time: dayjs.Dayjs) => {
  // copy current time to the date
  const dateTime = previous.hour(time.hour()).minute(time.minute()).second(0)

  // add a day to keep timestamps in chronological order
  return dateTime.isBefore(previous) ? dateTime.add(24, 'hours') : dateTime
}

export const splitTime = (hhMM: string) => {
  const [hours, minutes] = hhMM.split(':')
  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}
