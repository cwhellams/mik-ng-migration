import { db } from './connection.ts'
import type { Selectable } from 'kysely'
import type { MemberRegister, MemberBrevoSyncState } from './schema.ts'
import logger from '../lib/logger.ts'
import type { BrevoSyncStatus } from '../services/brevo/models.ts'
import { MIKMemberTypes } from '../routes/members/models.ts'

/**
 * Get the last successful sync state
 */
export async function getLastBrevoSyncState(): Promise<Selectable<MemberBrevoSyncState> | null> {
  const state = await db
    .selectFrom('member.brevo_sync_state')
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
export async function createBrevoSyncState(
  membersSynced: number,
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS',
  errorMessage?: string,
): Promise<number> {
  const result = await db
    .insertInto('member.brevo_sync_state')
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
export async function updateBrevoSyncState(
  syncId: number,
  membersSynced: number,
  status: 'SUCCESS' | 'FAILED',
  errorMessage?: string,
): Promise<void> {
  await db
    .updateTable('member.brevo_sync_state')
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
    .where('is_membership_approved', '=', true)
    .where('email_verified_at', 'is not', null)
    .where('member_type', 'not in', [
      MIKMemberTypes.EXTERNAL,
      MIKMemberTypes.REMOVED,
      MIKMemberTypes.SYSTEM,
    ])

  if (lastSyncedAt) {
    // Get members updated since last sync OR never synced OR failed
    query = query.where((eb) =>
      eb.or([
        eb('updated_at', '>', lastSyncedAt),
        eb('brevo_synced_at', 'is', null),
        eb('brevo_sync_status', '=', 'FAILED'),
      ]),
    )
  } else {
    // First sync - get all approved and verified members
    query = query.where((eb) =>
      eb.or([eb('brevo_synced_at', 'is', null), eb('brevo_sync_status', '=', 'FAILED')]),
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
      brevo_synced_at: new Date(),
      brevo_sync_status: status,
      brevo_contact_id: brevoContactId,
    })
    .where('member_id', '=', memberId)
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
    .where('brevo_sync_status', '=', 'PENDING')
    .where('is_membership_approved', '=', true)
    .where('email_verified_at', 'is not', null)
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
    .where('member_id', '=', memberId)
    .executeTakeFirst()
}

/**
 * Mark member as needing Brevo sync (used when member is updated)
 */
export async function markMemberForBrevoSync(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      brevo_sync_status: 'PENDING',
    })
    .where('member_id', '=', memberId)
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
    .select('brevo_sync_status')
    .select((eb) => eb.fn.count('member_id').as('count'))
    .where('is_membership_approved', '=', true)
    .where('email_verified_at', 'is not', null)
    .groupBy('brevo_sync_status')
    .execute()

  const counts = {
    pending: 0,
    synced: 0,
    failed: 0,
  }

  results.forEach((result) => {
    const count = Number(result.count)
    if (result.brevo_sync_status === 'PENDING') {
      counts.pending = count
    } else if (result.brevo_sync_status === 'SYNCED') {
      counts.synced = count
    } else if (result.brevo_sync_status === 'FAILED') {
      counts.failed = count
    }
  })

  return counts
}
