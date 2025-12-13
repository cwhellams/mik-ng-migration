import 'dotenv/config'

import cron from 'node-cron'
import logger from '../lib/logger.ts'
import { getOccurrences } from '../db/occurrence-queries.ts'
import { OccurrenceStatus } from '../routes/occurrences/models.ts'
import { sendOccurrenceNotification } from '../templates/occurrenceNotification.ts'
import { sendEmail } from '../lib/sendGmail.ts'

let scheduledTask: cron.ScheduledTask | null = null

export interface NotificationWorkerDeps {
  sendEmailFn?: typeof sendEmail
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the email notification worker
 * Runs daily at 9am to send any pending notifications.
 */
export function startOccurrenceNotificationWorker(deps: NotificationWorkerDeps = {}) {
  const { sendEmailFn = sendEmail, cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.OCCURRENCE_NOTIFICATION_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn('Occurrence Email Notification is disabled')
    return {
      stop: () => {
        logger.info('Occurrence Email Notification Worker is not running')
      },
    }
  }

  logger.info('Starting Occurrence Email Notification Worker - scheduled for 7am UTC daily')

  // Schedule task to run daily at 7:00 AM UTC
  // Cron format: minute hour day month weekday
  // '0 7 * * *' = At 7:00 AM every day
  scheduledTask = cronSchedule('0 7 * * *', async () => {
    logger.info('Occurrence Email Notification Worker: Starting scheduled run')
    await sendOccurrenceNotifications(sendEmailFn)
  })

  return {
    stop: () => {
      logger.info('Stopping Occurrence Email Notification Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

/**
 * Send occurrence notifications for all pending occurrences
 */
async function sendOccurrenceNotifications(sendEmailFn: typeof sendEmail): Promise<void> {
  try {
    logger.info('Fetching pending occurrences from database')
    const pendingOccurrences = await getOccurrences({
      statuses: [
        // occurrence not yet marked as received
        OccurrenceStatus.NEW,

        // occurrence received but still not fully anyonymized
        OccurrenceStatus.ANONYMIZING,
      ],
    })

    if (pendingOccurrences.length === 0) {
      logger.info('No pending occurrences found')
      return
    }

    logger.info(`Found ${pendingOccurrences.length} pending occurrences to notify`)

    for (const occurrence of pendingOccurrences) {
      try {
        await sendOccurrenceNotification(sendEmailFn, occurrence)
      } catch (error) {
        logger.error(`Error sending notification for occurrence ${occurrence.id}:`, error)
      }
    }

    logger.info(
      `Occurrence notification sync completed: ${pendingOccurrences.length} occurrences notified`,
    )
  } catch (error) {
    logger.error('Error during occurrence notification sync:', error)
  }
}
