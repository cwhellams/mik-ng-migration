import 'dotenv/config'

import dayjs from 'dayjs'
import {
  getQualificationsByExpiryDate,
  hasExpiryNotificationBeenSent,
  recordExpiryNotificationSent,
  type QualificationField,
} from '../db/instructor-qualification-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import { createMailboxMessage } from '../db/mailbox-queries.ts'
import logger from '../lib/logger.ts'
import {
  qualificationExpiryReminderMailboxBody,
  qualificationExpiredMailboxBody,
  buildQualificationEmailVars,
} from '../templates/qualificationExpiryEmailTemplate.ts'
import { TRAINING_EMAIL } from '../templates/registry.ts'
import { renderEmail } from '../templates/renderEmail.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export interface QualificationExpiryWorkerDeps extends CronWorkerDeps {
  sendEmailFn?: typeof sendEmail
}

/**
 * Start the qualification expiry notification worker.
 * Runs daily at 07:00 to:
 *   - Send reminder emails N days before expiry (QUALIFICATION_EXPIRY_REMINDER_DAYS, default 15)
 *   - Send expiry notifications on the day a qualification expires, CC koulutus@mik.fi
 */
export const startQualificationExpiryWorker = defineWorker<QualificationExpiryWorkerDeps>({
  name: 'Qualification Expiry Worker',
  envPrefix: 'QUALIFICATION_EXPIRY_WORKER',
  // '0 7 * * *' = At 7:00 AM every day
  schedule: '0 7 * * *',
  scheduleDescription: 'daily at 07:00',
  runOnStartup: true,
  run: ({ sendEmailFn = sendEmail }) => processQualificationExpiry(sendEmailFn),
})

async function processQualificationExpiry(sendEmailFn: typeof sendEmail): Promise<void> {
  const reminderDays = parseInt(process.env.QUALIFICATION_EXPIRY_REMINDER_DAYS ?? '15', 10)
  const today = dayjs().format('YYYY-MM-DD')
  const reminderDate = dayjs().add(reminderDays, 'day').format('YYYY-MM-DD')

  logger.info(
    `Qualification Expiry Worker: checking expiry on ${today} and reminders for ${reminderDate}`,
  )

  try {
    await sendReminderNotifications(reminderDate, reminderDays, sendEmailFn)
    await sendExpiredNotifications(today, sendEmailFn)
  } catch (error) {
    logger.error('Error during qualification expiry processing:', error)
  }
}

/**
 * Find qualifications expiring on `reminderDate` and send reminder emails.
 */
async function sendReminderNotifications(
  reminderDate: string,
  daysUntilExpiry: number,
  sendEmailFn: typeof sendEmail,
): Promise<void> {
  const expiring = await getQualificationsByExpiryDate(reminderDate)

  if (expiring.length === 0) {
    logger.info(`No qualifications expiring on ${reminderDate} — no reminders needed`)
    return
  }

  logger.info(`Found ${expiring.length} qualification(s) expiring on ${reminderDate}`)

  for (const q of expiring) {
    const alreadySent = await hasExpiryNotificationBeenSent(
      q.memberId,
      q.field,
      'REMINDER',
      q.expiryDate,
    )

    if (alreadySent) {
      logger.info(
        `Reminder already sent for ${q.memberId} ${q.field} expiring ${q.expiryDate} — skipping`,
      )
      continue
    }

    try {
      const vars = buildQualificationEmailVars(
        q.firstName,
        q.field as QualificationField,
        dayjs(q.expiryDate).format('DD.MM.YYYY'),
        q.lang,
        daysUntilExpiry,
      )

      const { subject, html } = renderEmail('qualification-expiry-reminder', q.lang, vars)

      sendEmailFn(q.email, subject, html)

      await createMailboxMessage({
        recipientId: q.memberId,
        type: 'QUALIFICATION_EXPIRY_REMINDER',
        severity: 'warning',
        title: subject,
        body: qualificationExpiryReminderMailboxBody(q.lang, vars),
        dedupKey: `qualification-expiry:${q.field}:REMINDER:${q.expiryDate}`,
      })

      await recordExpiryNotificationSent(q.memberId, q.field, 'REMINDER', q.expiryDate)

      logger.info(`Sent reminder to ${q.email} for ${q.field} expiring ${q.expiryDate}`)
    } catch (error) {
      logger.error(
        `Error sending reminder for ${q.memberId} ${q.field} expiring ${q.expiryDate}:`,
        error,
      )
    }
  }
}

/**
 * Find qualifications that expire today and send expiry notifications to the instructor
 * and (as CC) to koulutus@mik.fi.
 */
async function sendExpiredNotifications(
  today: string,
  sendEmailFn: typeof sendEmail,
): Promise<void> {
  const expired = await getQualificationsByExpiryDate(today)

  if (expired.length === 0) {
    logger.info(`No qualifications expiring today (${today}) — no expired notifications needed`)
    return
  }

  logger.info(`Found ${expired.length} qualification(s) expiring today (${today})`)

  for (const q of expired) {
    const alreadySent = await hasExpiryNotificationBeenSent(
      q.memberId,
      q.field,
      'EXPIRED',
      q.expiryDate,
    )

    if (alreadySent) {
      logger.info(
        `Expired notification already sent for ${q.memberId} ${q.field} expiring ${q.expiryDate} — skipping`,
      )
      continue
    }

    try {
      const vars = buildQualificationEmailVars(
        q.firstName,
        q.field as QualificationField,
        dayjs(q.expiryDate).format('DD.MM.YYYY'),
        q.lang,
      )

      const { subject, html: body } = renderEmail('qualification-expired', q.lang, vars)

      // Send to the instructor
      sendEmailFn(q.email, subject, body)

      // Also notify the training department
      sendEmailFn(TRAINING_EMAIL, `${subject} — ${q.lastName} ${q.firstName}`, body)

      await createMailboxMessage({
        recipientId: q.memberId,
        type: 'QUALIFICATION_EXPIRED',
        severity: 'error',
        title: subject,
        body: qualificationExpiredMailboxBody(q.lang, vars),
        dedupKey: `qualification-expiry:${q.field}:EXPIRED:${q.expiryDate}`,
      })

      await recordExpiryNotificationSent(q.memberId, q.field, 'EXPIRED', q.expiryDate)

      logger.info(
        `Sent expiry notification to ${q.email} and ${TRAINING_EMAIL} for ${q.field} expired ${q.expiryDate}`,
      )
    } catch (error) {
      logger.error(
        `Error sending expiry notification for ${q.memberId} ${q.field} expiring ${q.expiryDate}:`,
        error,
      )
    }
  }
}
