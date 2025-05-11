import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import updateLocale from 'dayjs/plugin/updateLocale'
import 'dayjs/locale/fi'
import 'dayjs/locale/en'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(updateLocale)

// // Configure both locales to start week on Monday (1)
dayjs.updateLocale('en', {
  weekStart: 1,
})
dayjs.updateLocale('fi', {
  weekStart: 1,
})

export const toLocalDate = (date?: string | null) =>
  date ? dayjs.tz(dayjs(date), 'Europe/Helsinki').format('DD.MM.YYYY') : null
