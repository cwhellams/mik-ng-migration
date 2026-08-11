import 'dotenv/config'

import { claimUpcomingBookingsForReminder } from '../db/booking-queries.ts'
import { getMemberById } from '../db/member-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import logger from '../lib/logger.ts'
import { renderEmail } from '../templates/renderEmail.ts'
import { bookingEmailVars } from '../templates/bookingEmailHelpers.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export interface BookingReminderWorkerDeps extends CronWorkerDeps {
  sendEmailFn?: typeof sendEmail
}

/**
 * Start the booking reminder worker
 * Runs hourly to check for bookings starting in ~24 hours and sends reminder emails
 */
export const startBookingReminderWorker = defineWorker<BookingReminderWorkerDeps>({
  name: 'Booking Reminder Worker',
  envPrefix: 'BOOKING_REMINDER_WORKER',
  // '0 * * * *' = At minute 0 of every hour
  schedule: '0 * * * *',
  scheduleDescription: 'hourly',
  run: ({ sendEmailFn = sendEmail }) =>
    sendBookingReminders(
      sendEmailFn,
      parseInt(process.env.BOOKING_REMINDER_HOURS_BEFORE || '24', 10),
    ),
})

/**
 * Send booking reminder emails for all upcoming bookings needing a reminder.
 * Bookings are claimed atomically via an UPDATE...RETURNING query to prevent
 * duplicate emails when multiple worker instances run concurrently.
 *
 * @param sendEmailFn - Email sending function (injectable for testing)
 * @param hoursBeforeBooking - How many hours before the booking to send the reminder (default: 24)
 */
export async function sendBookingReminders(
  sendEmailFn: typeof sendEmail,
  hoursBeforeBooking: number = 24,
): Promise<void> {
  try {
    logger.info('Claiming upcoming bookings needing reminder from database')
    const bookings = await claimUpcomingBookingsForReminder(hoursBeforeBooking)

    if (bookings.length === 0) {
      logger.info('No upcoming bookings found that need reminder emails')
      return
    }

    logger.info(`Found ${bookings.length} upcoming bookings to send reminders for`)

    let sentCount = 0
    let errorCount = 0

    for (const booking of bookings) {
      try {
        const member = await getMemberById(booking.memberId)
        if (!member) {
          logger.warn(`Member not found for booking ${booking.bookingId}: ${booking.memberId}`)
          errorCount++
          continue
        }

        logger.info(
          `Sending booking reminder email for booking ${booking.bookingId} to ${member.email} (${member.lang})`,
        )

        const { subject, html } = renderEmail(
          'booking-reminder',
          member.lang,
          bookingEmailVars(booking, { firstName: member.firstName }),
        )
        await sendEmailFn(member.email, subject, html)

        sentCount++
        logger.info(
          `Sent booking reminder for booking ${booking.bookingId} to member ${booking.memberId}`,
        )
      } catch (error) {
        errorCount++
        logger.error(`Error processing booking reminder for booking ${booking.bookingId}:`, error)
      }
    }

    logger.info(
      `Booking reminder processing completed: ${sentCount} reminders sent, ${errorCount} errors`,
    )
  } catch (error) {
    logger.error('Error during booking reminder processing:', error)
  }
}
