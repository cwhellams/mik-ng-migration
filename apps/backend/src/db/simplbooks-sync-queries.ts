import { db } from './connection.ts'
import type { Selectable } from 'kysely'
import type { MemberRegister, MemberBrevoSyncState } from './schema.js'
import logger from '../lib/logger.ts'
import type { SimplbooksSyncStatus } from '../services/simplbooks/models.ts'
import { MIKMemberTypes } from '../routes/members/models.ts'

/**
 * Get the last successful sync state
 */
export async function getLastSimplbooksSyncState(): Promise<Selectable<MemberBrevoSyncState> | null> {
  const state = await db
    .selectFrom('member.simplbooks_sync_state')
    .selectAll()
    .where('sync_status', '=', 'SUCCESS')
    .orderBy('last_synced_at', 'desc')
    .limit(1)
    .executeTakeFirst()

  return state ?? null
}

/**
 * Create a new sync state record
 */
export async function createSimplbooksSyncState(
  membersSynced: number,
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS',
  errorMessage?: string,
): Promise<number> {
  const result = await db
    .insertInto('member.simplbooks_sync_state')
    .values({
      last_synced_at: new Date(),
      members_synced: membersSynced,
      sync_status: status,
      error_message: errorMessage,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return result.id
}

/**
 * Update an existing sync state record
 */
export async function updateSimplbooksSyncState(
  syncId: number,
  membersSynced: number,
  status: 'SUCCESS' | 'FAILED',
  errorMessage?: string,
): Promise<void> {
  await db
    .updateTable('member.simplbooks_sync_state')
    .set({
      last_synced_at: new Date(),
      members_synced: membersSynced,
      sync_status: status,
      error_message: errorMessage,
    })
    .where('id', '=', syncId)
    .execute()
}

/**
 * Get members that need to be synced to Simplbooks
 * Returns members that:
 * - Have never been synced (simplbooks_synced_at is null)
 * - OR have been updated since last sync (updated_at > simplbooks_synced_at)
 * - OR have a failed sync status
 */
export async function getMembersToSync(lastSyncedAt?: Date): Promise<Selectable<MemberRegister>[]> {
  let query = db
    .selectFrom('member.register')
    .selectAll()
    .where('is_membership_approved', '=', true)
    .where('email_verified_at', 'is not', null)
    .where('member_type', 'not in', [
      MIKMemberTypes.EXTERNAL,
      MIKMemberTypes.REMOVED,
      MIKMemberTypes.SYSTEM,
    ])

  if (lastSyncedAt) {
    // Get members updated since last sync OR never synced OR failed
    query = query.where(eb =>
      eb.or([
        eb('updated_at', '>', lastSyncedAt),
        eb('simplbooks_synced_at', 'is', null),
        eb('simplbooks_sync_status', '=', 'FAILED'),
      ]),
    )
  } else {
    // First sync - get all approved and verified members
    query = query.where(eb =>
      eb.or([eb('simplbooks_synced_at', 'is', null), eb('simplbooks_sync_status', '=', 'FAILED')]),
    )
  }

  return await query.execute()
}

/**
 * Update member's Simplbooks sync status
 */
export async function updateMemberSimplbooksSyncStatus(
  memberId: string,
  status: SimplbooksSyncStatus,
): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      simplbooks_synced_at: new Date(),
      simplbooks_sync_status: status,
    })
    .where('member_id', '=', memberId)
    .execute()

  logger.info(`Updated Simplbooks sync status for member ${memberId} to ${status}`)
}

/**
 * Get members with pending Simplbooks sync status
 */
export async function getMembersWithPendingSimplbooksSync(): Promise<Selectable<MemberRegister>[]> {
  return await db
    .selectFrom('member.register')
    .selectAll()
    .where('simplbooks_sync_status', '=', 'PENDING')
    .where('is_membership_approved', '=', true)
    .where('email_verified_at', 'is not', null)
    .execute()
}

/**
 * Get member by ID for Simplbooks sync
 */
export async function getMemberForSimplbooksSync(
  memberId: string,
): Promise<Selectable<MemberRegister> | undefined> {
  return await db
    .selectFrom('member.register')
    .selectAll()
    .where('member_id', '=', memberId)
    .executeTakeFirst()
}

/**
 * Mark member as needing Simplbooks sync (used when member is updated)
 */
export async function markMemberForSimplbooksSync(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      simplbooks_sync_status: 'PENDING',
    })
    .where('member_id', '=', memberId)
    .execute()
}

/**
 * Get count of members by sync status
 */
export async function getSimplbooksSyncStatusCounts(): Promise<{
  pending: number
  synced: number
  failed: number
}> {
  const results = await db
    .selectFrom('member.register')
    .select('simplbooks_sync_status')
    .select(eb => eb.fn.count('member_id').as('count'))
    .where('is_membership_approved', '=', true)
    .where('email_verified_at', 'is not', null)
    .groupBy('simplbooks_sync_status')
    .execute()

  const counts = {
    pending: 0,
    synced: 0,
    failed: 0,
  }

  results.forEach(result => {
    const count = Number(result.count)
    if (result.simplbooks_sync_status === 'PENDING') {
      counts.pending = count
    } else if (result.simplbooks_sync_status === 'SYNCED') {
      counts.synced = count
    } else if (result.simplbooks_sync_status === 'FAILED') {
      counts.failed = count
    }
  })

  return counts
}
