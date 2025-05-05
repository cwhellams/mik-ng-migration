import { db } from '../../db/connection.ts'
import logger from '../../lib/logger.ts'
import { MemberProfileSchema } from '../../routes/members/models.ts'
import { SimplbooksStatus, type AcctsOutboxSimplbooks } from './models.ts'
import { createNewClient } from './simplbooksApiClient.ts'

export const SIMPLBOOKS_USER: string = 'simplbks'

export const handleOutboxMsg = async (msg: AcctsOutboxSimplbooks) => {
  if (msg && msg.event_type === 'addMember') {
    addMember(msg)
    return
  }

  throw new Error(`Unknown event type: ${msg.event_type}`)
}

async function addMember(outboxMsg: AcctsOutboxSimplbooks) {
  // Extract the member data from the outbox message, validate it, and create a new client in SimplBooks

  const memberProfile = MemberProfileSchema.parse(outboxMsg.payload)

  const clientId = await createNewClient(memberProfile)
  logger.info(
    `Created new SimplBooks client with ID: ${clientId} for member: ${memberProfile.email}`,
  )

  await db.transaction().execute(async txn => {
    await txn
      .updateTable('member.register')
      .set({ billing_id: clientId.toString(), updated_at: new Date(), updated_by: SIMPLBOOKS_USER })
      .where('email', '=', memberProfile.email)
      .execute()

    await txn
      .updateTable('accts.outbox_simplbooks')
      .set({
        status: SimplbooksStatus.SYNCED,
        updated_at_utc: new Date(),
        processed_at: new Date(),
      })
      .where('id', '=', outboxMsg.id)
      .execute()
  })
}

export async function checkAndClearStuckMessages() {
  const results = await db
    .updateTable('accts.outbox_simplbooks')
    .set({ status: SimplbooksStatus.PENDING })
    .where('status', '=', SimplbooksStatus.PROCESSING)
    .execute()
  if (results.length > 0) {
    logger.warn(
      `Cleared ${results.length} stuck messages in the SimplBooks outbox with status PROCESSING`,
    )
  }
}
