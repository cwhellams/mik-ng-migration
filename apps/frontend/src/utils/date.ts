import dayJs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tz from 'dayjs/plugin/timezone'
import updateLocale from 'dayjs/plugin/updateLocale'
import 'dayjs/locale/fi'
import 'dayjs/locale/en'

dayJs.extend(utc)
dayJs.extend(updateLocale)
dayJs.extend(tz)

// // Configure both locales to start week on Monday (1)
dayJs.updateLocale('en', {
  weekStart: 1,
})
dayJs.updateLocale('fi', {
  weekStart: 1,
})

export const dayjs = dayJs

// Format date to localized format
export const formatDateInTz = (
  timestamp: string | Date | Dayjs | null | undefined,
  tz: 'local' | 'utc',
  template: string
) => {
  return timestamp
    ? tz === 'local'
      ? // render local date without timezone conversions to avoid issues with the default timezone
        dayjs(timestamp).format(template)
      : dayjs(timestamp).tz(timezoneName(tz)).format(template)
    : '-'
}

// Format time from timestamp to display format
export const formatTimeInTz = (
  timestamp: string | number | Date,
  tz: 'local' | 'utc' | 'helsinki',
  {
    showSeconds = false,
  }: {
    showSeconds?: boolean
  } = {}
) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezoneName(tz),
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  })
}

// Helsinki timezone constant for schedule feature
export const HELSINKI_TIMEZONE = 'Europe/Helsinki'

/**
 * Parse UTC timestamp to Helsinki timezone.
 * Use this for displaying booking times in the schedule.
 */
export const toHelsinki = (value: string | Date | Dayjs) => {
  return dayjs(value).tz(HELSINKI_TIMEZONE)
}

export const timezoneName = (tz: 'utc' | 'local' | 'helsinki') =>
  tz === 'utc' ? 'UTC' : tz === 'helsinki' ? HELSINKI_TIMEZONE : undefined

/** Returns the UTC offset label e.g. UTC, "UTC+2" or "UTC+3". */
export const getOffsetLabelInTz = (
  timestamp?: string | Date | number,
  tz: 'utc' | 'local' | 'helsinki' = 'local'
): string => {
  // 'shortOffset' gives "GMT+3" — replace with UTC for aviation convention.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezoneName(tz),
    timeZoneName: 'shortOffset',
  })
    .formatToParts(timestamp ? new Date(timestamp) : new Date())
    .find((p) => p.type === 'timeZoneName')

  return parts?.value.replace('GMT', 'UTC') ?? 'HEL'
}
