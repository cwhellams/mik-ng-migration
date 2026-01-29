import 'dotenv/config'
import logger from '../lib/logger.ts'

import { updateClient } from '../services/simplbooks/simplbooksApiClient.ts'
import {
  createSimplbooksSyncState,
  getLastSimplbooksSyncState,
  getMembersToSync,
  getSimplbooksSyncStatusCounts,
  updateMemberSimplbooksSyncStatus,
  updateSimplbooksSyncState,
} from '../db/simplbooks-sync-queries.ts'
import type { ClientData } from '../services/simplbooks/models.ts'

let intervalId: NodeJS.Timeout | null = null
const SYNC_INTERVAL_MS = 8 * 60 * 60 * 1000 // 8 hours

const IS_SIMPLBOOKS_MEMBER_SYNC_ENABLED = process.env.SIMPLBOOKS_MEMBER_SYNC_ENABLED === 'true'
const SIMPLBOOKS_MEMBER_SYNC_RUN_ON_STARTUP =
  process.env.SIMPLBOOKS_MEMBER_SYNC_RUN_ON_STARTUP === 'true'

export function startSimplbooksSyncWorker() {
  if (!IS_SIMPLBOOKS_MEMBER_SYNC_ENABLED) {
    logger.info('Simplbooks member sync is disabled')
    return {
      stop: () => {
        logger.info('Simplbooks member sync worker stop called but worker was not running')
      },
    }
  }

  logger.info('Starting Simplbooks sync worker')

  // Run sync on startup if enabled
  if (SIMPLBOOKS_MEMBER_SYNC_RUN_ON_STARTUP) {
    logger.info('Running Simplbooks member sync on startup')
    syncMembersToSimplbooks().catch(error => {
      logger.error('Error during startup Simplbooks sync:', error)
    })
  }

  // Schedule recurring sync
  const startSync = () => {
    intervalId = setInterval(async () => {
      try {
        await syncMembersToSimplbooks()
      } catch (error) {
        logger.error('Error during scheduled Simplbooks sync:', error)
      }
    }, SYNC_INTERVAL_MS)
  }

  startSync()

  return {
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
        logger.info('Simplbooks sync worker stopped')
      }
    },
  }
}

export async function syncMembersToSimplbooks(): Promise<void> {
  logger.info('Starting Simplbooks member sync')

  // Record sync start
  const syncId = await createSimplbooksSyncState(0, 'IN_PROGRESS')

  try {
    // Get last successful sync time
    const lastSyncState = await getLastSimplbooksSyncState()
    const lastSyncedAt = lastSyncState?.last_synced_at

    logger.info(
      `Last successful sync was at: ${lastSyncedAt ? lastSyncedAt.toISOString() : 'never'}`,
    )

    // Get members that need syncing
    const membersToSync = await getMembersToSync(lastSyncedAt ?? undefined)
    logger.info(`Found ${membersToSync.length} members to sync to Simplbooks`)

    if (membersToSync.length === 0) {
      logger.info('No members to sync')
      await updateSimplbooksSyncState(syncId, 0, 'SUCCESS')
      return
    }

    let syncedCount = 0
    let failedCount = 0

    // Process each member
    for (const member of membersToSync) {
      try {
        await syncMemberToSimplbooks(member)
        syncedCount++
      } catch (error) {
        failedCount++
        logger.error(`Failed to sync member ${member.member_id} to Simplbooks:`, error)
        // Mark as failed but continue with other members
        await updateMemberSimplbooksSyncStatus(member.member_id, 'FAILED')
      }
    }

    // Record sync completion
    await updateSimplbooksSyncState(syncId, syncedCount, 'SUCCESS')

    // Log summary
    const statusCounts = await getSimplbooksSyncStatusCounts()
    logger.info('Simplbooks sync completed', {
      syncedThisRun: syncedCount,
      failedThisRun: failedCount,
      totalPending: statusCounts.pending,
      totalSynced: statusCounts.synced,
      totalFailed: statusCounts.failed,
    })
  } catch (error) {
    logger.error('Fatal error during Simplbooks sync:', error)

    await updateSimplbooksSyncState(
      syncId,
      0,
      'FAILED',
      error instanceof Error ? error.message : 'Unknown error',
    )
  }
}

type MemberToSync = Awaited<ReturnType<typeof getMembersToSync>>[number]

async function syncMemberToSimplbooks(member: MemberToSync): Promise<void> {
  logger.info(`Syncing member ${member.member_id} (${member.email}) to Simplbooks`)

  // Check if contact already exists in Simplbooks
  if (!member.billing_id)
    throw new Error(`Member ${member.member_id} does not have a billing_id, unable to sync !`)

  // Update existing contact
  logger.info(`Updating existing Simplbooks contact for member ${member.member_id}`)

  const client: ClientData = {
    Client: {
      e_mail: member.email,
      name: member.first_name + ' ' + member.last_name,
      phone: member.phone_number ?? '',
      address_street: member.street_address ?? '',
      address_city: member.town_city ?? '',
      address_postal_code: member.postcode ?? '',
    },
  }
  await updateClient(Number(member.billing_id), client)
  await updateMemberSimplbooksSyncStatus(member.member_id, 'SYNCED')

  logger.info(`Successfully synced member ${member.member_id} to Simplbooks`)
}
