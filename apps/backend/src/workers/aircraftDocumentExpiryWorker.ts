import 'dotenv/config'

import dayjs from 'dayjs'
import {
  getAircraftDocumentsExpiringOn,
  hasAircraftDocumentNotificationBeenSent,
  recordAircraftDocumentNotificationSent,
} from '../db/aircraft-document-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import logger from '../lib/logger.ts'
import { renderEmail } from '../templates/renderEmail.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export interface AircraftDocumentExpiryWorkerDeps extends CronWorkerDeps {
  sendEmailFn?: typeof sendEmail
}

/**
 * Start the aircraft document expiry notification worker.
 * Runs daily at 07:00 to:
 *   - Send reminder emails at configurable thresholds before expiry
 *     (AIRCRAFT_DOCUMENT_EXPIRY_REMINDER_DAYS, default: "30,7")
 *   - Send expiry notifications on the day a document expires
 *
 * Notifications are suppressed when a newer document of the same type and
 * aircraft already exists (valid_from > expiring doc's valid_to).
 * Duplicate emails are prevented via flight.aircraft_document_expiry_notifications.
 */
export const startAircraftDocumentExpiryWorker = defineWorker<AircraftDocumentExpiryWorkerDeps>({
  name: 'Aircraft Document Expiry Worker',
  envPrefix: 'AIRCRAFT_DOCUMENT_EXPIRY_WORKER',
  // '0 7 * * *' = At 07:00 every day
  schedule: '0 7 * * *',
  scheduleDescription: 'daily at 07:00',
  runOnStartup: true,
  run: ({ sendEmailFn = sendEmail }) => processAircraftDocumentExpiry(sendEmailFn),
})

async function processAircraftDocumentExpiry(sendEmailFn: typeof sendEmail): Promise<void> {
  const recipientEmail = process.env.KALUSTO_EMAIL
  if (!recipientEmail) {
    logger.error('KALUSTO_EMAIL is not configured; skipping aircraft document expiry notifications')
    return
  }

  const rawDays = process.env.AIRCRAFT_DOCUMENT_EXPIRY_REMINDER_DAYS ?? '30,7'
  const reminderDaysList = rawDays
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)

  const today = dayjs().format('YYYY-MM-DD')

  logger.info(
    `Aircraft Document Expiry Worker: checking expiry on ${today}, reminders at [${reminderDaysList.join(', ')}] days`,
  )

  try {
    for (const days of reminderDaysList) {
      const reminderDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
      await sendReminderNotifications(reminderDate, days, recipientEmail, sendEmailFn)
    }
    await sendExpiredNotifications(today, recipientEmail, sendEmailFn)
  } catch (error) {
    logger.error('Error during aircraft document expiry processing:', error)
  }
}

async function sendReminderNotifications(
  reminderDate: string,
  daysUntilExpiry: number,
  recipientEmail: string,
  sendEmailFn: typeof sendEmail,
): Promise<void> {
  const expiring = await getAircraftDocumentsExpiringOn(reminderDate)

  if (expiring.length === 0) {
    logger.info(`No aircraft documents expiring on ${reminderDate} — no reminders needed`)
    return
  }

  logger.info(`Found ${expiring.length} aircraft document(s) expiring on ${reminderDate}`)

  for (const doc of expiring) {
    const alreadySent = await hasAircraftDocumentNotificationBeenSent(
      doc.documentId,
      'REMINDER',
      daysUntilExpiry,
    )

    if (alreadySent) {
      logger.info(
        `Reminder already sent for document ${doc.documentId} (${doc.documentType} / ${doc.aircraftRegistration}) at ${daysUntilExpiry}-day threshold — skipping`,
      )
      continue
    }

    try {
      const expiryDateFormatted = dayjs(doc.validTo).format('DD.MM.YYYY')
      const vars = {
        aircraftRegistration: doc.aircraftRegistration,
        documentType: doc.documentType,
        documentTitle: doc.title,
        expiryDate: expiryDateFormatted,
        daysUntilExpiry,
      }

      const { subject, html } = renderEmail('aircraft-document-expiry-reminder', 'en', vars)
      await sendEmailFn(recipientEmail, subject, html)

      await recordAircraftDocumentNotificationSent(doc.documentId, 'REMINDER', daysUntilExpiry)

      logger.info(
        `Sent reminder to ${recipientEmail} for ${doc.documentType} (${doc.aircraftRegistration}) expiring ${doc.validTo}`,
      )
    } catch (error) {
      logger.error(
        `Error sending reminder for document ${doc.documentId} (${doc.documentType} / ${doc.aircraftRegistration}):`,
        error,
      )
    }
  }
}

async function sendExpiredNotifications(
  today: string,
  recipientEmail: string,
  sendEmailFn: typeof sendEmail,
): Promise<void> {
  const expired = await getAircraftDocumentsExpiringOn(today)

  if (expired.length === 0) {
    logger.info(`No aircraft documents expiring today (${today}) — no expired notifications needed`)
    return
  }

  logger.info(`Found ${expired.length} aircraft document(s) expiring today (${today})`)

  for (const doc of expired) {
    const alreadySent = await hasAircraftDocumentNotificationBeenSent(doc.documentId, 'EXPIRED', 0)

    if (alreadySent) {
      logger.info(
        `Expired notification already sent for document ${doc.documentId} (${doc.documentType} / ${doc.aircraftRegistration}) — skipping`,
      )
      continue
    }

    try {
      const expiryDateFormatted = dayjs(doc.validTo).format('DD.MM.YYYY')
      const vars = {
        aircraftRegistration: doc.aircraftRegistration,
        documentType: doc.documentType,
        documentTitle: doc.title,
        expiryDate: expiryDateFormatted,
      }

      const { subject, html } = renderEmail('aircraft-document-expired', 'en', vars)
      await sendEmailFn(recipientEmail, subject, html)

      await recordAircraftDocumentNotificationSent(doc.documentId, 'EXPIRED', 0)

      logger.info(
        `Sent expiry notification to ${recipientEmail} for ${doc.documentType} (${doc.aircraftRegistration}) expired ${doc.validTo}`,
      )
    } catch (error) {
      logger.error(
        `Error sending expiry notification for document ${doc.documentId} (${doc.documentType} / ${doc.aircraftRegistration}):`,
        error,
      )
    }
  }
}
