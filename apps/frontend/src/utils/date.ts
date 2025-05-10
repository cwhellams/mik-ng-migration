import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const toLocalDate = (date?: string | null) =>
  date ? dayjs.tz(dayjs(date), 'Europe/Helsinki').format('DD.MM.YYYY') : null
