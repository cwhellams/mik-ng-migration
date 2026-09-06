import { db } from './connection.ts'
import type { Selectable } from 'kysely'
import type { MemberRegister, MemberBrevoSyncState } from '@mik/db-schema/schema'
import logger from '../lib/logger.ts'
import type { BrevoSyncStatus } from '../services/brevo/models.ts'
import { MIKMemberTypes } from '@mik/contracts/members'

/**
 * Get the last successful sync state
 */
export async function getLastBrevoSyncState(): Promise<Selectable<MemberBrevoSyncState> | null> {
  const state = await db
    .selectFrom('member.brevoSyncState')
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
export async function createBrevoSyncState(
  membersSynced: number,
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS',
  errorMessage?: string,
): Promise<number> {
  const result = await db
    .insertInto('member.brevoSyncState')
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
export async function updateBrevoSyncState(
  syncId: number,
  membersSynced: number,
  status: 'SUCCESS' | 'FAILED',
  errorMessage?: string,
): Promise<void> {
  await db
    .updateTable('member.brevoSyncState')
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
 * Get members that need to be synced to Brevo
 * Returns members that:
 * - Have never been synced (brevo_synced_at is null)
 * - OR have been updated since last sync (updated_at > brevo_synced_at)
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
        eb('brevoSyncedAt', 'is', null),
        eb('brevoSyncStatus', '=', 'FAILED'),
      ]),
    )
  } else {
    // First sync - get all approved and verified members
    query = query.where((eb) =>
      eb.or([eb('brevoSyncedAt', 'is', null), eb('brevoSyncStatus', '=', 'FAILED')]),
    )
  }

  return await query.execute()
}

/**
 * Update member's Brevo sync status
 */
export async function updateMemberBrevoSyncStatus(
  memberId: string,
  status: BrevoSyncStatus,
  brevoContactId?: number,
): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      brevoSyncedAt: new Date(),
      brevoSyncStatus: status,
      brevoContactId: brevoContactId,
    })
    .where('memberId', '=', memberId)
    .execute()

  logger.info(`Updated Brevo sync status for member ${memberId} to ${status}`)
}

/**
 * Get members with pending Brevo sync status
 */
export async function getMembersWithPendingBrevoSync(): Promise<Selectable<MemberRegister>[]> {
  return await db
    .selectFrom('member.register')
    .selectAll()
    .where('brevoSyncStatus', '=', 'PENDING')
    .where('isMembershipApproved', '=', true)
    .where('emailVerifiedAt', 'is not', null)
    .execute()
}

/**
 * Get member by ID for Brevo sync
 */
export async function getMemberForBrevoSync(
  memberId: string,
): Promise<Selectable<MemberRegister> | undefined> {
  return await db
    .selectFrom('member.register')
    .selectAll()
    .where('memberId', '=', memberId)
    .executeTakeFirst()
}

/**
 * Mark member as needing Brevo sync (used when member is updated)
 */
export async function markMemberForBrevoSync(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      brevoSyncStatus: 'PENDING',
    })
    .where('memberId', '=', memberId)
    .execute()
}

/**
 * Get count of members by sync status
 */
export async function getBrevoSyncStatusCounts(): Promise<{
  pending: number
  synced: number
  failed: number
}> {
  const results = await db
    .selectFrom('member.register')
    .select('brevoSyncStatus')
    .select((eb) => eb.fn.count('memberId').as('count'))
    .where('isMembershipApproved', '=', true)
    .where('emailVerifiedAt', 'is not', null)
    .groupBy('brevoSyncStatus')
    .execute()

  const counts = {
    pending: 0,
    synced: 0,
    failed: 0,
  }

  results.forEach((result) => {
    const count = Number(result.count)
    if (result.brevoSyncStatus === 'PENDING') {
      counts.pending = count
    } else if (result.brevoSyncStatus === 'SYNCED') {
      counts.synced = count
    } else if (result.brevoSyncStatus === 'FAILED') {
      counts.failed = count
    }
  })

  return counts
}
