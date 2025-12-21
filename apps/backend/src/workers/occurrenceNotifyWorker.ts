import 'dotenv/config'

import cron from 'node-cron'
import logger from '../lib/logger.ts'
import { getOccurrences } from '../db/occurrence-queries.ts'
import { OccurrenceStatus } from '../routes/occurrences/models.ts'
import { sendOccurrenceNotification } from '../templates/occurrenceNotification.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import { MIKPermissions } from '../routes/members/models.ts'
import { getMemberRolesByPermission } from '../db/member-queries.ts'

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

    const smsProcessorRoles = await getMemberRolesByPermission(MIKPermissions.SMS_PROCESSOR)
    const smsManagerRoles = await getMemberRolesByPermission(MIKPermissions.SMS_MANAGER)

    // find NEW, ANONYMIZING and ANONYMIZED occurrences
    const pendingOccurrences = await getOccurrences(
      {
        ignoreStatuses: [
          OccurrenceStatus.RECEIVED,
          OccurrenceStatus.PROCESSED,
          OccurrenceStatus.CLOSED,
          OccurrenceStatus.DELETED,
        ],
      },
      {
        roles: [...smsProcessorRoles.map(r => r.roleId), ...smsManagerRoles.map(r => r.roleId)],
      },
    )

    if (pendingOccurrences.length === 0) {
      logger.info('No pending occurrences found')
      return
    }

    logger.info(`Found ${pendingOccurrences.length} pending occurrences to notify`)

    for (const occurrence of pendingOccurrences) {
      try {
        const rolesToNotify =
          occurrence.status === OccurrenceStatus.NEW ||
          occurrence.status === OccurrenceStatus.ANONYMIZING
            ? smsProcessorRoles.map(r => r.roleId)
            : smsManagerRoles.map(r => r.roleId)

        await sendOccurrenceNotification(sendEmailFn, rolesToNotify, occurrence)
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
