import 'dotenv/config'

import { purgeExpiredHetu } from '../db/mileage-queries.ts'
import logger from '../lib/logger.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export type MileageHetuPurgeWorkerDeps = CronWorkerDeps

/**
 * Start the mileage HETU purge worker.
 * Runs daily to null out HETU on mileage claims approved more than 7 days ago
 * (GDPR minimisation — HETU is only needed to file with Tulorekisteri, see #1022).
 */
export const startMileageHetuPurgeWorker = defineWorker<MileageHetuPurgeWorkerDeps>({
  name: 'Mileage HETU Purge Worker',
  envPrefix: 'MILEAGE_HETU_PURGE_WORKER',
  // '0 3 * * *' = At 03:00 every day
  schedule: '0 3 * * *',
  scheduleDescription: 'daily at 03:00',
  runOnStartup: true,
  run: () => processMileageHetuPurge(),
})

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
