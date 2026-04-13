import { dayjsLocalizer } from 'react-big-calendar'
import type { DateLocalizer } from 'react-big-calendar'
import dayjs from 'dayjs'

const merge: DateLocalizer['merge'] = (date, time) => {
  if (!date && !time) return null

  // Keep the range always in the default timezone
  const tm = dayjs(time).tz(undefined, true)
  const dt = dayjs(date).tz(undefined, true).startOf('day')

  // Extract time components from `time` and apply to the start of `date`
  return dt.hour(tm.hour()).minute(tm.minute()).second(tm.second()).toDate()
}

// The default dayjs localizer has a bug when dayjs timezone plugin is used
export const dayjsLocalizerTz = () => {
  const localizer = dayjsLocalizer(dayjs)
  localizer.merge = merge
  return localizer
}
