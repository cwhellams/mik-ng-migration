import { epochToHelsinki } from '@mik/contracts/date'

/** Localized title/body for the "booking in 1 hour" push notification. */
export const bookingPushReminderTitle = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'Varaus alkaa tunnin kuluttua'
    : lang === 'sv'
      ? 'Bokning börjar om en timme'
      : 'Booking in 1 hour'

export const bookingPushReminderBody = (
  lang: string | undefined,
  registration: string,
  startTimeEpoch: string,
): string => {
  const time = epochToHelsinki(startTimeEpoch).format('HH:mm')
  if (lang === 'fi') return `${registration} klo ${time}`
  if (lang === 'sv') return `${registration} kl ${time}`
  return `${registration} at ${time}`
}
