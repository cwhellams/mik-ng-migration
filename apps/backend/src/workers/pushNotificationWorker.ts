import 'dotenv/config'

import cron, { type ScheduledTask } from 'node-cron'
import {
  claimUpcomingBookingsForPushReminder,
  getPushSubscriptionsByMemberId,
  deletePushSubscriptionByEndpointGlobal,
} from '../db/push-queries.ts'
import { getMemberById } from '../db/member-queries.ts'
import { sendWebPush, type SendPushResult } from '../lib/webPush.ts'
import logger from '../lib/logger.ts'
import {
  bookingPushReminderTitle,
  bookingPushReminderBody,
} from '../templates/pushNotificationTemplate.ts'

let scheduledTask: ScheduledTask | null = null

export interface PushNotificationWorkerDeps {
  sendWebPushFn?: typeof sendWebPush
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the push notification worker.
 * Runs hourly to check for bookings starting in ~1 hour and sends browser
 * push reminders to the pilot (member_id), complementing the existing 24h
 * email reminder rather than replacing it.
 */
export function startPushNotificationWorker(deps: PushNotificationWorkerDeps = {}) {
  const { sendWebPushFn = sendWebPush, cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.PUSH_NOTIFICATION_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn('Push Notification Worker is disabled')
    return {
      stop: () => {
        logger.info('Push Notification Worker is not running')
      },
    }
  }

  const hoursBeforeBooking = parseInt(process.env.PUSH_NOTIFICATION_HOURS_BEFORE || '1', 10)
  logger.info(
    `Starting Push Notification Worker - scheduled hourly, sending reminders ${hoursBeforeBooking}h before booking`,
  )

  // Cron format: minute hour day month weekday
  // '0 * * * *' = At minute 0 of every hour
  scheduledTask = cronSchedule('0 * * * *', async () => {
    logger.info('Push Notification Worker: Starting scheduled run')
    await sendPushReminders(sendWebPushFn, hoursBeforeBooking)
  })

  return {
    stop: () => {
      logger.info('Stopping Push Notification Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

/**
 * Send booking push reminders for all upcoming bookings needing one.
 * Bookings are claimed atomically (see claimUpcomingBookingsForPushReminder)
 * to prevent duplicate notifications when multiple worker instances run
 * concurrently.
 *
 * @param sendWebPushFn - Push sending function (injectable for testing)
 * @param hoursBeforeBooking - How many hours before the booking to send the reminder (default: 1)
 */
export async function sendPushReminders(
  sendWebPushFn: typeof sendWebPush,
  hoursBeforeBooking: number = 1,
): Promise<void> {
  try {
    logger.info('Claiming upcoming bookings needing a push reminder from database')
    const bookings = await claimUpcomingBookingsForPushReminder(hoursBeforeBooking)

    if (bookings.length === 0) {
      logger.info('No upcoming bookings found that need push reminders')
      return
    }

    logger.info(`Found ${bookings.length} upcoming bookings to send push reminders for`)

    let sentCount = 0
    let errorCount = 0

    for (const booking of bookings) {
      try {
        const [member, subscriptions] = await Promise.all([
          getMemberById(booking.memberId),
          getPushSubscriptionsByMemberId(booking.memberId),
        ])

        if (!member) {
          logger.warn(`Member not found for booking ${booking.bookingId}: ${booking.memberId}`)
          errorCount++
          continue
        }

        if (subscriptions.length === 0) {
          // Member has not opted in to push notifications on any device — nothing to send.
          continue
        }

        const payload = {
          title: bookingPushReminderTitle(member.lang),
          body: bookingPushReminderBody(member.lang, booking.registration, booking.startTimeEpoch),
          url: '/schedule',
        }

        for (const subscription of subscriptions) {
          const result: SendPushResult = await sendWebPushFn(subscription, payload)
          if (result.ok) {
            sentCount++
          } else {
            errorCount++
            logger.error(
              `Error sending push notification for booking ${booking.bookingId} to member ${booking.memberId}:`,
              result.error,
            )
            if (result.gone) {
              await deletePushSubscriptionByEndpointGlobal(subscription.endpoint)
            }
          }
        }
      } catch (error) {
        errorCount++
        logger.error(`Error processing push reminder for booking ${booking.bookingId}:`, error)
      }
    }

    logger.info(
      `Push notification processing completed: ${sentCount} notifications sent, ${errorCount} errors`,
    )
  } catch (error) {
    logger.error('Error during push reminder processing:', error)
  }
}
