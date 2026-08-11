import 'dotenv/config'

import { deleteExpiredMailboxMessages } from '../db/mailbox-queries.ts'
import logger from '../lib/logger.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export type MailboxCleanupWorkerDeps = CronWorkerDeps

/**
 * Start the mailbox cleanup worker.
 * Runs hourly to delete mailbox messages past their TTL (1 year from creation).
 */
export const startMailboxCleanupWorker = defineWorker<MailboxCleanupWorkerDeps>({
  name: 'Mailbox Cleanup Worker',
  envPrefix: 'MAILBOX_CLEANUP_WORKER',
  // '0 * * * *' = At the start of every hour
  schedule: '0 * * * *',
  scheduleDescription: 'hourly',
  runOnStartup: true,
  run: () => processExpiredMailboxMessages(),
})

/**
 * Delete all expired mailbox messages from the database.
 */
export async function processExpiredMailboxMessages(): Promise<void> {
  try {
    const deleted = await deleteExpiredMailboxMessages()
    if (deleted > 0) {
      logger.info(`Mailbox Cleanup Worker: deleted ${deleted} expired message(s)`)
    } else {
      logger.info('Mailbox Cleanup Worker: no expired messages to delete')
    }
  } catch (error) {
    logger.error('Error during mailbox cleanup:', error)
  }
}
