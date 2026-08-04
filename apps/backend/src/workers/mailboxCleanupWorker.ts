import 'dotenv/config'

import cron, { type ScheduledTask } from 'node-cron'
import { deleteExpiredMailboxMessages } from '../db/mailbox-queries.ts'
import logger from '../lib/logger.ts'

let scheduledTask: ScheduledTask | null = null

export interface MailboxCleanupWorkerDeps {
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the mailbox cleanup worker.
 * Runs hourly to delete mailbox messages past their TTL (1 year from creation).
 */
export function startMailboxCleanupWorker(deps: MailboxCleanupWorkerDeps = {}) {
  const { cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.MAILBOX_CLEANUP_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn(
      'Mailbox Cleanup Worker is disabled (set MAILBOX_CLEANUP_WORKER_ENABLED=true to enable)',
    )
    return {
      stop: () => {
        logger.info('Mailbox Cleanup Worker is not running')
      },
    }
  }

  logger.info('Starting Mailbox Cleanup Worker — scheduled hourly')

  // '0 * * * *' = At the start of every hour
  scheduledTask = cronSchedule('0 * * * *', async () => {
    logger.info('Mailbox Cleanup Worker: Starting scheduled run')
    await processExpiredMailboxMessages()
  })

  if (process.env.MAILBOX_CLEANUP_WORKER_RUN_ON_STARTUP === 'true') {
    logger.info('Running mailbox cleanup immediately on startup')
    processExpiredMailboxMessages().catch((error) => {
      logger.error('Error during startup mailbox cleanup:', error)
    })
  }

  return {
    stop: () => {
      logger.info('Stopping Mailbox Cleanup Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

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
