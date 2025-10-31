import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

export const epochToLocal = (epoch: string) => toLocal(dayjs.unix(Number(epoch)))
export const toLocal = (day: dayjs.Dayjs | string | Date) => dayjs(day).tz('Europe/Helsinki')
