import 'dotenv/config'

import cron from 'node-cron'
import { deleteExpiredTinyUrls } from '../db/tiny-url-queries.ts'
import logger from '../lib/logger.ts'

let scheduledTask: cron.ScheduledTask | null = null

export interface TinyUrlCleanupWorkerDeps {
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the tiny URL cleanup worker.
 * Runs hourly to delete expired document tiny URLs from the database.
 */
export function startTinyUrlCleanupWorker(deps: TinyUrlCleanupWorkerDeps = {}) {
  const { cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.TINY_URL_CLEANUP_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn(
      'Tiny URL Cleanup Worker is disabled (set TINY_URL_CLEANUP_WORKER_ENABLED=true to enable)',
    )
    return {
      stop: () => {
        logger.info('Tiny URL Cleanup Worker is not running')
      },
    }
  }

  logger.info('Starting Tiny URL Cleanup Worker — scheduled hourly')

  // '0 * * * *' = At the start of every hour
  scheduledTask = cronSchedule('0 * * * *', async () => {
    logger.info('Tiny URL Cleanup Worker: Starting scheduled run')
    await processExpiredTinyUrls()
  })

  if (process.env.TINY_URL_CLEANUP_WORKER_RUN_ON_STARTUP === 'true') {
    logger.info('Running tiny URL cleanup immediately on startup')
    processExpiredTinyUrls().catch(error => {
      logger.error('Error during startup tiny URL cleanup:', error)
    })
  }

  return {
    stop: () => {
      logger.info('Stopping Tiny URL Cleanup Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

/**
 * Delete all expired tiny URLs from the database.
 */
export async function processExpiredTinyUrls(): Promise<void> {
  try {
    const deleted = await deleteExpiredTinyUrls()
    if (deleted > 0) {
      logger.info(`Tiny URL Cleanup Worker: deleted ${deleted} expired tiny URL(s)`)
    } else {
      logger.info('Tiny URL Cleanup Worker: no expired tiny URLs to delete')
    }
  } catch (error) {
    logger.error('Error during tiny URL cleanup:', error)
  }
}
