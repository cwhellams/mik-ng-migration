import 'dotenv/config'

import { db } from '../db/connection.ts'
import { SimplbooksStatus, type AcctsOutboxSimplbooks } from '../services/simplbooks/models.ts'

import logger from '../lib/logger.ts'
import { dispatchOutboxMsg } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import { checkAndClearStuckMessages } from '../db/outbox-simplbooks-queries.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function startSimpleBooksOutboxProcessor() {
  let shouldRun = process.env.SIMPLBOOKS_OUTBOX_WORKER_ENABLED === 'true'

  if (shouldRun) {
    checkAndClearStuckMessages()
    loop()
  } else {
    logger.warn('Simplbooks Outbox worker is not set to run. Simplebooks outbox worker is disabled')
  }

  async function loop() {
    while (shouldRun) {
      const delayMs = await processOutbox()
      await sleep(delayMs)
    }
  }

  return {
    stop: () => {
      shouldRun = false
    },
  }
}

async function processOutbox(): Promise<number> {
  try {
    logger.info('Outbox worker iteration started')

    const taskRow = await db.transaction().execute(async (txn) => {
      const nextRow = (await txn
        .selectFrom('accts.outbox_simplbooks')
        .selectAll()
        .where('status', '=', SimplbooksStatus.PENDING)
        .forUpdate()
        .skipLocked()
        .orderBy('created_at_utc', 'asc')
        .limit(1)
        .executeTakeFirst()) as AcctsOutboxSimplbooks | undefined

      if (!nextRow) {
        return undefined
      }

      await txn
        .updateTable('accts.outbox_simplbooks')
        .set({ status: SimplbooksStatus.PROCESSING })
        .where('id', '=', nextRow.id)
        .execute()

      return nextRow
    })

    if (!taskRow) {
      logger.info('No outbox tasks found, sleeping 30s')
      return 30_000
    }

    logger.info(`Processing outbox item : ${taskRow.id} of type ${taskRow.event_type}`)

    try {
      await dispatchOutboxMsg(taskRow) // axios happens here
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error(`Failed to process outbox item : ${taskRow.id}. Error: ${errorMessage}`)

      await db
        .updateTable('accts.outbox_simplbooks')
        .set({
          status: SimplbooksStatus.FAILED,
          error_message: errorMessage,
          updated_at_utc: new Date(),
        })
        .where('id', '=', taskRow.id)
        .execute()
    }

    // ⭐ strict rate limit: 1 per second
    return 1000
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`Unexpected error in outbox processor: ${msg}`)

    // backoff on unexpected failure
    return 5000
  }
}
