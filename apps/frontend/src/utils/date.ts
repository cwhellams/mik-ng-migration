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

export const formatDateTime = (
  timestamp?: string | Date | Dayjs | null,
  template = 'DD.MM.YYYY HH:mm'
) => formatDate(timestamp, template)

// Format date to localized format
export const formatDate = (
  timestamp?: string | Date | Dayjs | null,
  template = 'DD.MM.YYYY'
) => {
  return timestamp ? dayjs(timestamp).format(template) : '-'
}

// Format time from timestamp to display format
export const formatTime = (timestamp: string | Date) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
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

/** Format a UTC epoch (ms) into HH:MM:SS for the given IANA timezone. */
export const formatClockTime = (
  utcMs: number,
  timeZone: string,
  includeSeconds = true
): string => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(new Date(utcMs))
}

/** Returns the UTC offset label for Helsinki, e.g. "UTC+3" or "UTC+2". */
export const getHelsinkiOffsetLabel = (utcMs?: number): string => {
  // 'shortOffset' gives "GMT+3" — replace with UTC for aviation convention.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HELSINKI_TIMEZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(utcMs ? new Date(utcMs) : new Date())
    .find((p) => p.type === 'timeZoneName')

  return parts?.value.replace('GMT', 'UTC') ?? 'HEL'
}
