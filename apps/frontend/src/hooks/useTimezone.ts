import { Dayjs } from 'dayjs'
import { useThemeMode } from '../theme/ThemeContext'
import {
  formatDateInTz,
  formatTimeInTz,
  timezoneName,
  getOffsetLabelInTz,
} from '../utils/date'

export function useTimezone() {
  const { timezone, setTimezone } = useThemeMode()
  return {
    timezone,
    timezoneLetter: timezone === 'utc' ? 'Z' : 'L',
    timezoneName: timezoneName(timezone),
    timezoneOffset: (timestamp?: string | number | Date) =>
      getOffsetLabelInTz(timestamp, timezone),
    setTimezone,

    // Format date part in format "DD.MM.YYYY"
    formatDate: (timestamp: string | Date | Dayjs | null | undefined) =>
      // convert YYYY-MM-DD format into Date object to avoid timezone issues when formatting,
      typeof timestamp === 'string'
        ? formatDateInTz(new Date(timestamp), timezone, 'DD.MM.YYYY')
        : formatDateInTz(timestamp, timezone, 'DD.MM.YYYY'),

    // Format date and time in format "DD.MM.YYYY HH:mm"
    formatDateTime: (
      timestamp: string | Date | Dayjs | null | undefined,
      { showSeconds }: { showSeconds?: boolean } = { showSeconds: false }
    ) =>
      formatDateInTz(
        timestamp,
        timezone,
        `DD.MM.YYYY HH:mm${showSeconds ? ':ss' : ''}`
      ),
    formatDateCustom: (
      timestamp: string | Date | Dayjs | null | undefined,
      template: string
    ) => formatDateInTz(timestamp, timezone, template),

    // Format date part only in ISO format "YYYY-MM-DD".
    formatISODate: (timestamp: string | Date | Dayjs | null | undefined) =>
      typeof timestamp === 'string'
        ? // convert YYYY-MM-DD format into Date object to avoid timezone issues when formatting
          formatDateInTz(new Date(timestamp), timezone, 'YYYY-MM-DD')
        : formatDateInTz(timestamp, timezone, 'YYYY-MM-DD'),

    // Support any date or ISO timestamp string.
    formatISODateTime: (timestamp: string | Date | Dayjs | null | undefined) =>
      formatDateInTz(timestamp, timezone, 'YYYY-MM-DD HH:mm'),

    formatTime: (timestamp: string | number | Date, showSeconds?: boolean) =>
      formatTimeInTz(timestamp, timezone, { showSeconds }),
  }
}
