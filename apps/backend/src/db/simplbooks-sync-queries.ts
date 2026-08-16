import { db } from './connection.ts'
import type { Selectable } from 'kysely'
import type { MemberRegister, MemberSimplbooksSyncState } from './schema.d.ts'
import logger from '../lib/logger.ts'
import type { SimplbooksSyncStatus } from '../services/simplbooks/models.ts'
import { MIKMemberTypes } from '@mik/contracts/members'

/**
 * Get the last successful sync state
 */
export async function getLastSimplbooksSyncState(): Promise<Selectable<MemberSimplbooksSyncState> | null> {
  const state = await db
    .selectFrom('member.simplbooksSyncState')
    .selectAll()
    .where('syncStatus', '=', 'SUCCESS')
    .orderBy('lastSyncedAt', 'desc')
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
    .insertInto('member.simplbooksSyncState')
    .values({
      lastSyncedAt: new Date(),
      membersSynced: membersSynced,
      syncStatus: status,
      errorMessage: errorMessage,
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
    .updateTable('member.simplbooksSyncState')
    .set({
      lastSyncedAt: new Date(),
      membersSynced: membersSynced,
      syncStatus: status,
      errorMessage: errorMessage,
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
    .where('isMembershipApproved', '=', true)
    .where('emailVerifiedAt', 'is not', null)
    .where('memberType', 'not in', [
      MIKMemberTypes.EXTERNAL,
      MIKMemberTypes.REMOVED,
      MIKMemberTypes.SYSTEM,
    ])

  if (lastSyncedAt) {
    // Get members updated since last sync OR never synced OR failed
    query = query.where((eb) =>
      eb.or([
        eb('updatedAt', '>', lastSyncedAt),
        eb('simplbooksSyncedAt', 'is', null),
        eb('simplbooksSyncStatus', '=', 'FAILED'),
      ]),
    )
  } else {
    // First sync - get all approved and verified members
    query = query.where((eb) =>
      eb.or([eb('simplbooksSyncedAt', 'is', null), eb('simplbooksSyncStatus', '=', 'FAILED')]),
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
      simplbooksSyncedAt: new Date(),
      simplbooksSyncStatus: status,
    })
    .where('memberId', '=', memberId)
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
    .where('simplbooksSyncStatus', '=', 'PENDING')
    .where('isMembershipApproved', '=', true)
    .where('emailVerifiedAt', 'is not', null)
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
    .where('memberId', '=', memberId)
    .executeTakeFirst()
}

/**
 * Mark member as needing Simplbooks sync (used when member is updated)
 */
export async function markMemberForSimplbooksSync(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      simplbooksSyncStatus: 'PENDING',
    })
    .where('memberId', '=', memberId)
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
    .select('simplbooksSyncStatus')
    .select((eb) => eb.fn.count('memberId').as('count'))
    .where('isMembershipApproved', '=', true)
    .where('emailVerifiedAt', 'is not', null)
    .groupBy('simplbooksSyncStatus')
    .execute()

  const counts = {
    pending: 0,
    synced: 0,
    failed: 0,
  }

  results.forEach((result) => {
    const count = Number(result.count)
    if (result.simplbooksSyncStatus === 'PENDING') {
      counts.pending = count
    } else if (result.simplbooksSyncStatus === 'SYNCED') {
      counts.synced = count
    } else if (result.simplbooksSyncStatus === 'FAILED') {
      counts.failed = count
    }
  })

  return counts
}
