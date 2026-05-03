import 'dotenv/config'

import cron from 'node-cron'
import { claimUpcomingBookingsForReminder } from '../db/booking-queries.ts'
import { getMemberById } from '../db/member-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import logger from '../lib/logger.ts'
import {
  bookingReminderEmailSubject,
  bookingReminderEmailBodyHtml,
} from '../templates/bookingReminderEmailTemplate.ts'

let scheduledTask: cron.ScheduledTask | null = null

export interface BookingReminderWorkerDeps {
  sendEmailFn?: typeof sendEmail
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the booking reminder worker
 * Runs hourly to check for bookings starting in ~24 hours and sends reminder emails
 */
export function startBookingReminderWorker(deps: BookingReminderWorkerDeps = {}) {
  const { sendEmailFn = sendEmail, cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.BOOKING_REMINDER_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn('Booking Reminder Worker is disabled')
    return {
      stop: () => {
        logger.info('Booking Reminder Worker is not running')
      },
    }
  }

  const hoursBeforeBooking = parseInt(process.env.BOOKING_REMINDER_HOURS_BEFORE || '24', 10)
  logger.info(
    `Starting Booking Reminder Worker - scheduled hourly, sending reminders ${hoursBeforeBooking}h before booking`,
  )

  // Schedule task to run every hour
  // Cron format: minute hour day month weekday
  // '0 * * * *' = At minute 0 of every hour
  scheduledTask = cronSchedule('0 * * * *', async () => {
    logger.info('Booking Reminder Worker: Starting scheduled run')
    await sendBookingReminders(sendEmailFn, hoursBeforeBooking)
  })

  return {
    stop: () => {
      logger.info('Stopping Booking Reminder Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

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

        await sendEmailFn(
          member.email,
          bookingReminderEmailSubject(member.lang),
          bookingReminderEmailBodyHtml(member.lang, member.firstName, booking),
        )

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
