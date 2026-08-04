import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'
import {
  bookingTemplateLang,
  bookingScheduleHref as href,
  formatBookingRange as formatRange,
} from './bookingEmailHelpers.ts'

export const bookingInstructorConfirmedEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'Sinut on merkitty ohjaajaksi MIK-varaukseen'
    : lang === 'sv'
      ? 'Du har utsetts till instruktör för en MIK-bokning'
      : "You've been assigned as instructor for a MIK booking"

export const bookingInstructorUpdatedEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK-varaus, jossa olet ohjaajana, on päivitetty'
    : lang === 'sv'
      ? 'En MIK-bokning där du är instruktör har uppdaterats'
      : "A MIK booking where you're the instructor has been updated"

export const bookingInstructorCancelledEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK-varaus, jossa olit ohjaajana, on peruttu'
    : lang === 'sv'
      ? 'En MIK-bokning där du var instruktör har ställts in'
      : 'A MIK booking where you were the instructor has been cancelled'

export const bookingInstructorConfirmedEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
  studentName: string,
): string =>
  markdownEmailTemplate(`booking-instructor-confirmed-${bookingTemplateLang(lang)}.md`, {
    firstName,
    studentName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    calendarLink: generateGoogleCalendarLink(booking),
    href: href(booking),
  })

export const bookingInstructorUpdatedEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
  studentName: string,
): string =>
  markdownEmailTemplate(`booking-instructor-updated-${bookingTemplateLang(lang)}.md`, {
    firstName,
    studentName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    calendarLink: generateGoogleCalendarLink(booking),
    href: href(booking),
  })

export const bookingInstructorCancelledEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
  studentName: string,
): string =>
  markdownEmailTemplate(`booking-instructor-cancelled-${bookingTemplateLang(lang)}.md`, {
    firstName,
    studentName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    href: href(booking),
  })
