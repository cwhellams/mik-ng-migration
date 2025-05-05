import 'dotenv/config'

import pRetry from 'p-retry'
import { db } from '../db/connection.ts'
import { SimplbooksStatus, type AcctsOutboxSimplbooks } from '../services/simplbooks/models.ts'

import logger from '../lib/logger.ts'
import {
  checkAndClearStuckMessages,
  handleOutboxMsg,
} from '../services/simplbooks/simplbooksOutboxHandler.ts'

let intervalId: any = null
let intervalMs = 1000 // 1 second

export function startSimpleBooksOutboxProcessor() {
  let shouldRun = process.env.SIMPLBOOKS_OUTBOX_WORKER_ENABLED === 'true'

  async function loop() {
    if (!shouldRun) {
      logger.warn(
        'Simplbooks Outbox worker is not set to run. Simplebooks outbox worker is disabled',
      )
      return
    }
    await processOutbox()

    if (!shouldRun) return

    intervalId = setTimeout(loop, intervalMs)
  }

  loop()

  return {
    stop: () => {
      shouldRun = false
    },
  }
}

async function processOutbox() {
  // on startup we need to check if there are any stuck tasks and reset them - this is a safety net
  // in case the worker was not stopped properly but it may result in data loss or duplication , this is a tradeoff
  // we need to make sure that the worker is not running before we do this
  // THIS IS NOT SAFE IF THE WORKER IS RUNNING IN MULTIPLE SERVICE INSTANCES !!!!!

  await checkAndClearStuckMessages()

  logger.info(`Outbox worker run : ${intervalId ?? 'initial'} started`)
  intervalMs = 1000 // reset to 1 second

  const taskRow: AcctsOutboxSimplbooks | undefined = await db.transaction().execute(async txn => {
    const nextRow = await txn
      .selectFrom('accts.outbox_simplbooks')
      .selectAll()
      .where('status', '=', SimplbooksStatus.PENDING)
      .forUpdate()
      .skipLocked()
      .limit(1)
      .executeTakeFirst()

    if (nextRow === undefined) {
      logger.info(
        `No tasks found in the outbox for run : ${intervalId ?? 'initial'}, waiting 30 seconds`,
      )
      intervalMs = 30000 // 30 seconds
      return
    }

    await txn
      .updateTable('accts.outbox_simplbooks')
      .set({ status: SimplbooksStatus.PROCESSING })
      .where('id', '=', nextRow.id)
      .execute()

    return nextRow
  })

  if (taskRow === undefined) {
    return
  }
  logger.info(`Processing outbox item : ${taskRow.id} of type ${taskRow.event_type}`)
  pRetry(async () => await handleOutboxMsg(taskRow), {
    retries: 5,
    minTimeout: 1000,
    maxTimeout: 10000,
    factor: 2,
    onFailedAttempt: error => {
      logger.error(
        `Simplbooks attempt ${error.attemptNumber} failed for outbox item : ${taskRow!.id} of type ${taskRow!.event_type}. Error: ${error.message}, there are ${error.retriesLeft} retries left`,
      )
    },
  })
}
