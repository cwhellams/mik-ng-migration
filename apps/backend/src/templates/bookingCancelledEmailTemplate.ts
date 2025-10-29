import 'dotenv/config'
import { marked } from 'marked'
import type { BookingUpsertRequest } from '../routes/bookings/models.ts'
import { emailButton, emailTemplate } from './emailTemplate.ts'
import type { Member } from '../routes/members/models.ts'
import { epochToLocal } from '../util/date.ts'

export const bookingCancelledEmailSubject = (lang: string | undefined): string =>
  lang == 'fi' ? 'MIK varauksesi peruttu' : 'Your booking is cancelled'

export const bookingCancelledEmailBodyHtml = (
  lang: string | undefined,
  admin: Member,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string =>
  lang == 'fi'
    ? bookingCancelledEmailBodyHtmlFi(admin, oldBooking, newBooking)
    : bookingCancelledEmailBodyHtmlEn(admin, oldBooking, newBooking)

export const bookingCancelledEmailPlainText = (
  lang: string | undefined,
  admin: Member,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string =>
  marked.parse(
    lang == 'fi'
      ? bookingCancelledEmailPlainTextFi(admin, oldBooking, newBooking)
      : bookingCancelledEmailPlainTextEn(admin, oldBooking, newBooking),
    {
      async: false,
    },
  )

const href = (booking: BookingUpsertRequest) =>
  `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

const formatRange = (booking: BookingUpsertRequest) =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`

const bookingCancelledEmailBodyHtmlFi = (
  admin: Member,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string =>
  emailTemplate(
    'Varauksesi on peruttu',
    `
      <p>Hei,</p>

      <p>
        Varauksesi koneelle ${oldBooking.registration} ${formatRange(oldBooking)} on peruttu.
      </p>

      <p>
        Korvaava varaus on tehty ajalle ${formatRange(newBooking)}.
        Syy ${newBooking.description ?? newBooking.type}. Varauksen tekijä ${admin.firstName} ${admin.lastName}.
      </p>

      <div style="text-align: center; margin: 24px 0;">
        ${emailButton(href(oldBooking), 'Tarkistele varauskalenteria')}
      </div>
      `,
  )

const bookingCancelledEmailBodyHtmlEn = (
  admin: Member,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string =>
  emailTemplate(
    'Your booking is cancelled',
    `

      <p>Hello,</p>

      <p>
        Your booking for plane ${oldBooking.registration} ${formatRange(oldBooking)} has been cancelled.
      </p>

      <p>
        A replacement booking has been made for the period
        ${formatRange(newBooking)}.
        Reason: ${newBooking.description ?? newBooking.type}. Booking created by: ${admin.firstName} ${admin.lastName}.
      </p>

      <div style="text-align: center; margin: 24px 0;">
        ${emailButton(href(oldBooking), 'Check the booking calendar')}
      </div>
      `,
  )

const bookingCancelledEmailPlainTextEn = (
  admin: Member,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string => `
Hello, 

Your booking for plane ${oldBooking.registration} ${formatRange(oldBooking)} has been cancelled.

A replacement booking has been made for the period ${formatRange(newBooking)}.
Reason: ${newBooking.description ?? newBooking.type}. Booking created by: ${admin.firstName} ${admin.lastName}.

Check the booking calendar at ${href(oldBooking)}.
`

const bookingCancelledEmailPlainTextFi = (
  admin: Member,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string =>
  `
Hei,

Varauksesi koneelle ${oldBooking.registration} ${formatRange(oldBooking)} on peruttu.

Korvaava varaus on tehty ajalle ${formatRange(newBooking)}.
Syy ${newBooking.description ?? newBooking.type}. Varauksen tekijä ${admin.firstName} ${admin.lastName}.

Tarkistele varauskalenteria sivustolla ${href(oldBooking)}.
`.trim()
