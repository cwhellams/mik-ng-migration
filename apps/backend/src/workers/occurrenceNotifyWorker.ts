import 'dotenv/config'

import logger from '../lib/logger.ts'
import { getOccurrences } from '../db/occurrence-queries.ts'
import { OccurrenceStatus } from '@mik/contracts/occurrences'
import { sendOccurrenceNotification } from '../templates/occurrenceNotification.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { getMemberRolesByPermission } from '../db/member-queries.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export interface NotificationWorkerDeps extends CronWorkerDeps {
  sendEmailFn?: typeof sendEmail
}

/**
 * Start the email notification worker
 * Runs daily at 7am UTC to send any pending notifications.
 */
export const startOccurrenceNotificationWorker = defineWorker<NotificationWorkerDeps>({
  name: 'Occurrence Email Notification Worker',
  envPrefix: 'OCCURRENCE_NOTIFICATION_WORKER',
  // '0 7 * * *' = At 7:00 AM every day
  schedule: '0 7 * * *',
  scheduleDescription: 'daily at 07:00 UTC',
  run: ({ sendEmailFn = sendEmail }) => sendOccurrenceNotifications(sendEmailFn),
})

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
        roles: [...smsProcessorRoles.map((r) => r.roleId), ...smsManagerRoles.map((r) => r.roleId)],
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
            ? smsProcessorRoles.map((r) => r.roleId)
            : smsManagerRoles.map((r) => r.roleId)

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
