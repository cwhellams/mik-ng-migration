import 'dotenv/config'

import { db } from '../db/connection.ts'
import { SimplbooksStatus } from '../services/simplbooks/models.ts'

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

// Exported so a test can drive one iteration directly, per the worker guidance in
// .github/copilot-instructions.md. Nothing covered this function until the collapse
// (issue #1115), which is how the row it reads and the schema describing that row
// drifted apart unnoticed.
export async function processOutbox(): Promise<number> {
  try {
    logger.info('Outbox worker iteration started')

    const taskRow = await db.transaction().execute(async (txn) => {
      // Deliberately not cast to AcctsOutboxSimplbooks. A cast here is what let the
      // row schema drift out of sync with the row: it stayed snake_case after this
      // query moved to the camelCase instance, so `event_type` read undefined and
      // every dispatch threw "Unsupported outbox event type: undefined".
      const nextRow = await txn
        .selectFrom('accts.outboxSimplbooks')
        .selectAll()
        .where('status', '=', SimplbooksStatus.PENDING)
        .forUpdate()
        .skipLocked()
        .orderBy('createdAtUtc', 'asc')
        .limit(1)
        .executeTakeFirst()

      if (!nextRow) {
        return undefined
      }

      await txn
        .updateTable('accts.outboxSimplbooks')
        .set({ status: SimplbooksStatus.PROCESSING })
        .where('id', '=', nextRow.id)
        .execute()

      return nextRow
    })

    if (!taskRow) {
      logger.info('No outbox tasks found, sleeping 30s')
      return 30_000
    }

    logger.info(`Processing outbox item : ${taskRow.id} of type ${taskRow.eventType}`)

    try {
      await dispatchOutboxMsg(taskRow) // axios happens here
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error(`Failed to process outbox item : ${taskRow.id}. Error: ${errorMessage}`)

      await db
        .updateTable('accts.outboxSimplbooks')
        .set({
          status: SimplbooksStatus.FAILED,
          errorMessage: errorMessage,
          updatedAtUtc: new Date(),
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
