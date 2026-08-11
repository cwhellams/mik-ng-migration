import 'dotenv/config'

import { deleteExpiredTinyUrls } from '../db/tiny-url-queries.ts'
import logger from '../lib/logger.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export type TinyUrlCleanupWorkerDeps = CronWorkerDeps

/**
 * Start the tiny URL cleanup worker.
 * Runs hourly to delete expired document tiny URLs from the database.
 */
export const startTinyUrlCleanupWorker = defineWorker<TinyUrlCleanupWorkerDeps>({
  name: 'Tiny URL Cleanup Worker',
  envPrefix: 'TINY_URL_CLEANUP_WORKER',
  // '0 * * * *' = At the start of every hour
  schedule: '0 * * * *',
  scheduleDescription: 'hourly',
  runOnStartup: true,
  run: () => processExpiredTinyUrls(),
})

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
