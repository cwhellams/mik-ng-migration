import { sql } from 'kysely'
import type { Selectable } from 'kysely'
import { db } from './connection.ts'
import type { MemberBrevoCampaignArchiveState } from './schema.d.ts'

/**
 * Get the most recent campaign archive sync state, regardless of status —
 * a missing row means the worker has never run (bootstrap case).
 */
export async function getLastBrevoCampaignArchiveState(): Promise<Selectable<MemberBrevoCampaignArchiveState> | null> {
  const state = await db
    .selectFrom('member.brevo_campaign_archive_state')
    .selectAll()
    .orderBy('last_synced_at', 'desc')
    .limit(1)
    .executeTakeFirst()

  return state ?? null
}

export async function createBrevoCampaignArchiveState(
  lastSyncedAt: Date,
  campaignsArchived: number,
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS',
  errorMessage?: string,
): Promise<number> {
  const result = await db
    .insertInto('member.brevo_campaign_archive_state')
    .values({
      last_synced_at: lastSyncedAt,
      campaigns_archived: campaignsArchived,
      sync_status: status,
      error_message: errorMessage,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return result.id
}

export async function updateBrevoCampaignArchiveState(
  id: number,
  lastSyncedAt: Date,
  campaignsArchived: number,
  status: 'SUCCESS' | 'FAILED',
  errorMessage?: string,
): Promise<void> {
  await db
    .updateTable('member.brevo_campaign_archive_state')
    .set({
      last_synced_at: lastSyncedAt,
      campaigns_archived: campaignsArchived,
      sync_status: status,
      // Kysely omits undefined-valued columns from .set(), which would leave
      // a stale error_message from an earlier FAILED run in place forever
      // since this row is reused rather than re-inserted each run.
      error_message: errorMessage ?? null,
    })
    .where('id', '=', id)
    .execute()
}

const brevoCampaignTag = (campaignId: number) => `brevo-campaign-id:${campaignId}`

/**
 * Check whether a newsletter document already exists for the given Brevo
 * campaign, to avoid re-archiving on cursor overlap or worker retries.
 */
export async function isCampaignAlreadyArchived(campaignId: number): Promise<boolean> {
  const record = await db
    .selectFrom('member.documents')
    .select('document_id')
    .where('category', '=', 'newsletter')
    .where(sql<boolean>`tags @> ARRAY[${brevoCampaignTag(campaignId)}]::text[]`)
    .executeTakeFirst()

  return record !== undefined
}
