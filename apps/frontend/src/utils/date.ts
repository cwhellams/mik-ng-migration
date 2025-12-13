import dayJs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import updateLocale from 'dayjs/plugin/updateLocale'
import 'dayjs/locale/fi'
import 'dayjs/locale/en'

dayJs.extend(utc)
dayJs.extend(updateLocale)

// // Configure both locales to start week on Monday (1)
dayJs.updateLocale('en', {
  weekStart: 1,
})
dayJs.updateLocale('fi', {
  weekStart: 1,
})

export const dayjs = dayJs

export const formatDateTime = (
  timestamp?: string | Date | null,
  template = 'DD.MM.YYYY HH:mm'
) => formatDate(timestamp, template)

// Format date to localized format
export const formatDate = (
  timestamp?: string | Date | null,
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
