import type { Dayjs } from 'dayjs'
import { formatDateInTz, formatTimeInTz, timezoneName, getOffsetLabelInTz } from './date'

export type TimezonePreference = 'utc' | 'local'

/**
 * Every date/time formatter the apps render through, bound to one timezone
 * preference.
 *
 * This is the whole body of `useTimezone` with the preference passed in rather
 * than read from a context. Both apps keep that preference in their own theme
 * context — `apps/frontend` lets the member switch it, `apps/admin` has its own
 * copy — but the formatting is identical in both, and a Z-vs-local bug fixed in
 * one should not need fixing again in the other.
 */
export const timezoneFormatters = (timezone: TimezonePreference) => ({
  timezone,
  timezoneLetter: timezone === 'utc' ? 'Z' : 'L',
  timezoneName: timezoneName(timezone),
  timezoneOffset: (timestamp?: string | number | Date) => getOffsetLabelInTz(timestamp, timezone),

  // Format date part in format "DD.MM.YYYY"
  formatDate: (timestamp: string | Date | Dayjs | null | undefined) =>
    // convert YYYY-MM-DD in local format to avoid timezone shifts
    typeof timestamp === 'string' && timestamp.match(/^\d{4}-\d{2}-\d{2}$/)
      ? formatDateInTz(timestamp, 'local', 'DD.MM.YYYY')
      : formatDateInTz(timestamp, timezone, 'DD.MM.YYYY'),

  // Format date and time in format "DD.MM.YYYY HH:mm"
  formatDateTime: (
    timestamp: string | Date | Dayjs | null | undefined,
    { showSeconds }: { showSeconds?: boolean } = { showSeconds: false },
  ) => formatDateInTz(timestamp, timezone, `DD.MM.YYYY HH:mm${showSeconds ? ':ss' : ''}`),

  formatDateCustom: (timestamp: string | Date | Dayjs | null | undefined, template: string) =>
    formatDateInTz(timestamp, timezone, template),

  // Format date part only in ISO format "YYYY-MM-DD".
  formatISODate: (timestamp: string | Date | Dayjs | null | undefined) =>
    typeof timestamp === 'string' && timestamp.match(/^\d{4}-\d{2}-\d{2}$/)
      ? // keep YYYY-MM-DD in local format to avoid timezone shifts
        formatDateInTz(timestamp, 'local', 'YYYY-MM-DD')
      : formatDateInTz(timestamp, timezone, 'YYYY-MM-DD'),

  // Support any date or ISO timestamp string.
  formatISODateTime: (timestamp: string | Date | Dayjs | null | undefined) =>
    formatDateInTz(timestamp, timezone, 'YYYY-MM-DD HH:mm'),

  formatTime: (timestamp: string | number | Date, showSeconds?: boolean) =>
    formatTimeInTz(timestamp, timezone, { showSeconds }),
})
