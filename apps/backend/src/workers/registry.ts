import logger from '../lib/logger.ts'
import type { WorkerHandle } from './defineWorker.ts'

import { startSimpleBooksOutboxProcessor } from './simplbooksOutboxWorker.ts'
import { startSimplbooksInvoicePaymentWorker } from './simplbooksInvoicePaymentWorker.ts'
import { startOverdueInvoiceWorker } from './overdueInvoiceWorker.ts'
import { startOccurrenceNotificationWorker } from './occurrenceNotifyWorker.ts'
import { startBrevoSyncWorker } from './brevoSyncWorker.ts'
import { startBrevoCampaignArchiveWorker } from './brevoCampaignArchiveWorker.ts'
import { startSimplbooksSyncWorker } from './simplbooksMemberSyncWorker.ts'
import { startBookingReminderWorker } from './bookingReminderWorker.ts'
import { startJuniorMemberPromotionWorker } from './juniorMemberPromotionWorker.ts'
import { startQualificationExpiryWorker } from './qualificationExpiryWorker.ts'
import { startTinyUrlCleanupWorker } from './tinyUrlCleanupWorker.ts'
import { startAircraftDocumentExpiryWorker } from './aircraftDocumentExpiryWorker.ts'
import { startPushNotificationWorker } from './pushNotificationWorker.ts'
import { startMileageHetuPurgeWorker } from './mileageHetuPurgeWorker.ts'
import { startMailboxCleanupWorker } from './mailboxCleanupWorker.ts'

/**
 * Every background worker the API process owns.
 *
 * Each entry decides for itself whether it actually runs, from its own
 * `<PREFIX>_ENABLED` env var — a disabled worker still returns a handle whose
 * `stop()` is a no-op, so startup and shutdown stay a plain loop. Adding a
 * worker means adding one line here, not three edits in `app.ts`.
 */
export const workerRegistry: Array<() => WorkerHandle> = [
  startSimpleBooksOutboxProcessor,
  startSimplbooksInvoicePaymentWorker,
  startOverdueInvoiceWorker,
  startOccurrenceNotificationWorker,
  startBrevoSyncWorker,
  startBrevoCampaignArchiveWorker,
  startSimplbooksSyncWorker,
  startBookingReminderWorker,
  startJuniorMemberPromotionWorker,
  startQualificationExpiryWorker,
  startTinyUrlCleanupWorker,
  startAircraftDocumentExpiryWorker,
  startPushNotificationWorker,
  startMileageHetuPurgeWorker,
  startMailboxCleanupWorker,
]

/** Start every registered worker, returning their handles for shutdown. */
export const startAllWorkers = (): WorkerHandle[] => workerRegistry.map((start) => start())

/**
 * Stop every running worker. Each `stop` is wrapped so one throwing worker
 * can't strand the rest — this runs on the shutdown path, where the remaining
 * workers and the HTTP server still need to be closed.
 */
export const stopAllWorkers = (handles: WorkerHandle[]): void => {
  for (const handle of handles) {
    try {
      handle.stop()
    } catch (error) {
      logger.error('Error stopping worker:', error)
    }
  }
}
