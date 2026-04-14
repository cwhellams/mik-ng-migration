import { dayjsLocalizer } from 'react-big-calendar'
import type { DateLocalizer } from 'react-big-calendar'
import { dayjs, HELSINKI_TIMEZONE } from '../../utils/date'

/**
 * Custom merge function that properly combines date + time in Helsinki timezone.
 *
 * The default merge in react-big-calendar has a bug when timezone plugin is loaded:
 * it formats to strings "MM/DD/YYYY HH:mm:ss" then parses them, which causes
 * dayjs.tz() to misinterpret the string parsing.
 *
 * This version combines components directly within the timezone context.
 */
const merge: DateLocalizer['merge'] = (date, time) => {
  if (!date && !time) return null
  if (!time) return dayjs.tz(date, HELSINKI_TIMEZONE).toDate()
  if (!date) return dayjs.tz(time, HELSINKI_TIMEZONE).toDate()

  // Parse both as Helsinki timezone-aware
  const tm = dayjs.tz(time, HELSINKI_TIMEZONE)
  const dt = dayjs.tz(date, HELSINKI_TIMEZONE).startOf('day')

  // Combine components in Helsinki timezone
  return dt
    .hour(tm.hour())
    .minute(tm.minute())
    .second(tm.second())
    .millisecond(tm.millisecond())
    .toDate()
}

/**
 * Custom dayjs localizer with timezone support.
 * Fixes min/max handling when dayjs default timezone is set.
 */
export const dayjsLocalizerTz = () => {
  const localizer = dayjsLocalizer(dayjs)
  localizer.merge = merge
  return localizer
}
