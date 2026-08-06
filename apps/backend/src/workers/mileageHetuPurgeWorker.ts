import 'dotenv/config'

import cron, { type ScheduledTask } from 'node-cron'
import { purgeExpiredHetu } from '../db/mileage-queries.ts'
import logger from '../lib/logger.ts'

let scheduledTask: ScheduledTask | null = null

export interface MileageHetuPurgeWorkerDeps {
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the mileage HETU purge worker.
 * Runs daily to null out HETU on mileage claims approved more than 7 days ago
 * (GDPR minimisation — HETU is only needed to file with Tulorekisteri, see #1022).
 */
export function startMileageHetuPurgeWorker(deps: MileageHetuPurgeWorkerDeps = {}) {
  const { cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.MILEAGE_HETU_PURGE_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn(
      'Mileage HETU Purge Worker is disabled (set MILEAGE_HETU_PURGE_WORKER_ENABLED=true to enable)',
    )
    return {
      stop: () => {
        logger.info('Mileage HETU Purge Worker is not running')
      },
    }
  }

  logger.info('Starting Mileage HETU Purge Worker — scheduled daily at 03:00')

  // '0 3 * * *' = At 03:00 every day
  scheduledTask = cronSchedule('0 3 * * *', async () => {
    logger.info('Mileage HETU Purge Worker: Starting scheduled run')
    await processMileageHetuPurge()
  })

  if (process.env.MILEAGE_HETU_PURGE_WORKER_RUN_ON_STARTUP === 'true') {
    logger.info('Running mileage HETU purge immediately on startup')
    processMileageHetuPurge().catch((error) => {
      logger.error('Error during startup mileage HETU purge:', error)
    })
  }

  return {
    stop: () => {
      logger.info('Stopping Mileage HETU Purge Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

/**
 * Null out HETU on mileage claims approved more than 7 days ago.
 */
export async function processMileageHetuPurge(): Promise<void> {
  try {
    const purged = await purgeExpiredHetu()
    if (purged > 0) {
      logger.info(`Mileage HETU Purge Worker: purged HETU on ${purged} claim(s)`)
    } else {
      logger.info('Mileage HETU Purge Worker: no claims due for HETU purge')
    }
  } catch (error) {
    logger.error('Error during mileage HETU purge:', error)
  }
}
