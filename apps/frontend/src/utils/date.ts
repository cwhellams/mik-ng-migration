import dayJs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tz from 'dayjs/plugin/timezone'
import updateLocale from 'dayjs/plugin/updateLocale'
import isoWeek from 'dayjs/plugin/isoWeek'
import { HELSINKI_TIMEZONE, toHelsinki } from '@mik/contracts/date'
import 'dayjs/locale/fi'
import 'dayjs/locale/en'
import 'dayjs/locale/sv'

dayJs.extend(utc)
dayJs.extend(updateLocale)
dayJs.extend(tz)
dayJs.extend(isoWeek)

// // Configure both locales to start week on Monday (1)
dayJs.updateLocale('en', {
  weekStart: 1,
})
dayJs.updateLocale('fi', {
  weekStart: 1,
})
dayJs.updateLocale('sv', {
  weekStart: 1,
})

export const dayjs = dayJs

// Format date to localized format
export const formatDateInTz = (
  timestamp: string | Date | Dayjs | null | undefined,
  tz: 'local' | 'utc',
  template: string,
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
  } = {},
) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezoneName(tz),
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  })
}

// Both live in @mik/contracts/date, shared with the backend, which states every
// booking and flight time in Helsinki wall-clock time. Re-exported here so the
// ~29 call sites keep importing all their date helpers from one module.
export { HELSINKI_TIMEZONE, toHelsinki }

export const timezoneName = (tz: 'utc' | 'local' | 'helsinki') =>
  tz === 'utc' ? 'UTC' : tz === 'helsinki' ? HELSINKI_TIMEZONE : undefined

/** Returns the UTC offset label e.g. UTC, "UTC+2" or "UTC+3". */
export const getOffsetLabelInTz = (
  timestamp?: string | Date | number,
  tz: 'utc' | 'local' | 'helsinki' = 'local',
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

/**
 * Returns the effective medical expiry as the latest non-null date among
 * Class 1, Class 2, and LAPL certificates. Returns null when none are set.
 * Rationale: if any cert is still valid, the member is medically current.
 */
export const getEffectiveMedicalExpiry = (
  medicalClass1Expiry: string | null | undefined,
  medicalClass2Expiry: string | null | undefined,
  medicalLaplExpiry: string | null | undefined,
  medicalExpiryLegacy?: string | null | undefined,
): Dayjs | null => {
  const dates = [medicalClass1Expiry, medicalClass2Expiry, medicalLaplExpiry, medicalExpiryLegacy]
    .filter((d): d is string => d != null && d !== '')
    .map((d) => dayJs(d))
    .filter((d) => d.isValid())

  if (dates.length === 0) return null
  return dates.reduce((latest, d) => (d.isAfter(latest) ? d : latest))
}
