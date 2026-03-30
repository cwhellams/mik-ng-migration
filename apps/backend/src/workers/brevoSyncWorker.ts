import 'dotenv/config'
import logger from '../lib/logger.ts'
import * as brevoClient from '../services/brevo/brevoClient.ts'
import {
  getLastBrevoSyncState,
  createBrevoSyncState,
  updateBrevoSyncState,
  getMembersToSync,
  updateMemberBrevoSyncStatus,
  getBrevoSyncStatusCounts,
  getMemberForBrevoSync,
} from '../db/brevo-sync-queries.ts'
import type { BrevoContactAttributes, BrevoCreateContactRequest } from '../services/brevo/models.ts'
import { MemberTypeToBrevoListId, BrevoListId } from '../services/brevo/models.ts'
import type { Member, MIKLang, MIKMemberTypes } from '../routes/members/models.ts'
import { MIKMemberTypes as MemberTypes } from '../routes/members/models.ts'

let intervalId: NodeJS.Timeout | null = null
const SYNC_INTERVAL_MS = 8 * 60 * 60 * 1000 // 8 hours

export function startBrevoSyncWorker() {
  if (!brevoClient.isBrevoSyncEnabled) {
    logger.info('Brevo sync worker is disabled')
    return {
      stop: () => {
        logger.info('Brevo sync worker stop called but worker was not running')
      },
    }
  }

  logger.info('Starting Brevo sync worker')

  // Run on startup if configured
  if (brevoClient.runBrevoSyncOnStartup) {
    logger.info('Running Brevo sync on startup')
    syncMembersToBrevo().catch(error => {
      logger.error('Error during startup Brevo sync:', error)
    })
  }

  // Schedule recurring sync
  const startSync = () => {
    intervalId = setInterval(async () => {
      try {
        await syncMembersToBrevo()
      } catch (error) {
        logger.error('Error during scheduled Brevo sync:', error)
      }
    }, SYNC_INTERVAL_MS)
  }

  startSync()

  return {
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
        logger.info('Brevo sync worker stopped')
      }
    },
  }
}

async function syncMembersToBrevo(): Promise<void> {
  logger.info('Starting Brevo member sync')

  // Record sync start
  const syncId = await createBrevoSyncState(0, 'IN_PROGRESS')

  try {
    // Get last successful sync time
    const lastSyncState = await getLastBrevoSyncState()
    const lastSyncedAt = lastSyncState?.last_synced_at

    logger.info(
      `Last successful sync was at: ${lastSyncedAt ? lastSyncedAt.toISOString() : 'never'}`,
    )

    // Get members that need syncing
    const membersToSync = await getMembersToSync(lastSyncedAt ?? undefined)
    logger.info(`Found ${membersToSync.length} members to sync to Brevo`)

    if (membersToSync.length === 0) {
      logger.info('No members to sync')
      await updateBrevoSyncState(syncId, 0, 'SUCCESS')
      return
    }

    let syncedCount = 0
    let failedCount = 0

    // Process each member
    for (const member of membersToSync) {
      try {
        await syncMemberToBrevo(member)
        syncedCount++
      } catch (error) {
        failedCount++
        logger.error(`Failed to sync member ${member.member_id} to Brevo:`, error)
        // Mark as failed but continue with other members
        await updateMemberBrevoSyncStatus(member.member_id, 'FAILED')
      }
    }

    // Record sync completion
    await updateBrevoSyncState(syncId, syncedCount, 'SUCCESS')

    // Log summary
    const statusCounts = await getBrevoSyncStatusCounts()
    logger.info('Brevo sync completed', {
      syncedThisRun: syncedCount,
      failedThisRun: failedCount,
      totalPending: statusCounts.pending,
      totalSynced: statusCounts.synced,
      totalFailed: statusCounts.failed,
    })
  } catch (error) {
    logger.error('Fatal error during Brevo sync:', error)

    await updateBrevoSyncState(
      syncId,
      0,
      'FAILED',
      error instanceof Error ? error.message : 'Unknown error',
    )

    throw error
  }
}

type MemberToSync = Awaited<ReturnType<typeof getMembersToSync>>[number]

export async function removeMemberFromBrevo(member: Member): Promise<void> {
  logger.info(`Removing member ${member.memberId} from Brevo`)

  if (!member.brevoContactId || Number.isNaN(Number(member.brevoContactId))) {
    logger.warn(
      `Member ${member.memberId} does not have a valid Brevo contact ID, skipping removal from Brevo`,
    )
    return
  }

  await brevoClient.deleteContact(Number(member.brevoContactId))
  await updateMemberBrevoSyncStatus(member.memberId, 'SYNCED')
}

async function syncMemberToBrevo(member: MemberToSync): Promise<void> {
  logger.info(`Syncing member ${member.member_id} (${member.email}) to Brevo`)

  // Prepare contact attributes
  const attributes: BrevoContactAttributes = {
    FIRSTNAME: member.first_name,
    LASTNAME: member.last_name,
    MEMBER_TYPE: member.member_type as MIKMemberTypes,
    LANG_ISO639: member.lang_iso639 as MIKLang,
    IS_MEMBERSHIP_EXPIRED: member.is_membership_expired ?? false,
    EMAIL_VERIFIED: member.email_verified_at !== null,
  }

  // Determine list IDs based on member type
  const listId = MemberTypeToBrevoListId[member.member_type as MIKMemberTypes]
  const listIds: number[] = []

  // All non-REMOVED members should be in the ALL list
  if (member.member_type !== MemberTypes.REMOVED) {
    listIds.push(BrevoListId.ALL)
  }

  // Add member-type specific list if it exists
  if (listId !== undefined) {
    listIds.push(listId)
  }

  // Check if contact already exists in Brevo
  const existingContact = await brevoClient.getContactByExtId(member.member_id)

  if (existingContact) {
    // Update existing contact
    logger.info(`Updating existing Brevo contact for member ${member.member_id}`)

    // Check if member type changed (need to update lists)
    const currentListIds = existingContact.listIds || []
    const unlinkListIds = Object.values(MemberTypeToBrevoListId).filter(
      listId => !listIds.includes(listId) && currentListIds.includes(listId),
    )

    await brevoClient.updateContact(existingContact.id, {
      attributes,
      listIds,
      unlinkListIds: unlinkListIds.length > 0 ? unlinkListIds : undefined,
    })

    await updateMemberBrevoSyncStatus(member.member_id, 'SYNCED', existingContact.id)
  } else {
    // Create new contact
    logger.info(`Creating new Brevo contact for member ${member.member_id}`)

    const createRequest: BrevoCreateContactRequest = {
      email: member.email,
      ext_id: member.member_id,
      attributes,
      listIds,
      updateEnabled: true,
    }

    const contactId = await brevoClient.createContact(createRequest)
    await updateMemberBrevoSyncStatus(member.member_id, 'SYNCED', contactId)
  }

  logger.info(`Successfully synced member ${member.member_id} to Brevo`)
}

/**
 * Manually trigger a sync for a specific member (useful for testing or after member updates)
 */
export async function syncSingleMemberToBrevo(memberId: string): Promise<void> {
  logger.info(`Manually syncing member ${memberId} to Brevo`)

  const member = await getMemberForBrevoSync(memberId)

  if (!member) {
    throw new Error(`Member ${memberId} not found or not eligible for sync`)
  }

  await syncMemberToBrevo(member)
}

export async function removeSingleMemberFromBrevo(memberId: string): Promise<void> {
  logger.info(`Manually removing member ${memberId} from Brevo`)

  const member = await getMemberForBrevoSync(memberId)

  if (!member) {
    throw new Error(`Member ${memberId} not found or not eligible for sync`)
  }

  await syncMemberToBrevo(member)
}
