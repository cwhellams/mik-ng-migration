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

export const toLocalDate = (date?: string | null, format = 'DD.MM.YYYY') =>
  date ? dayjs(date).format(format) : null

// Format date from timestamp to localized format
export const formatDate = (timestamp: string | Date, template = 'D.M.YY') => {
  return dayjs(timestamp).format(template)
}

// Format time from timestamp to display format
export const formatTime = (timestamp: string | Date) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
