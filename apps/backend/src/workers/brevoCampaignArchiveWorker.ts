import 'dotenv/config'

import * as brevoClient from '../services/brevo/brevoClient.ts'
import { renderHtmlToPdf } from '../services/htmlToPdf.ts'
import { storageService } from '../services/storage.ts'
import { addDocument } from '../db/document-queries.ts'
import {
  getLastBrevoCampaignArchiveState,
  createBrevoCampaignArchiveState,
  updateBrevoCampaignArchiveState,
  isCampaignAlreadyArchived,
} from '../db/brevo-campaign-archive-queries.ts'
import { DocumentCategory } from '@mik/contracts/documents'
import type { BrevoCampaign } from '../services/brevo/models.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import logger from '../lib/logger.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

// Technical member used elsewhere in the codebase to attribute
// system-generated data (see V70__AddRootUserData.sql).
const SYSTEM_JWT_USER: JWTUser = {
  memberId: 'k1mnimda',
  lastName: 'System',
  email: 'k1mnimda@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
}

export type BrevoCampaignArchiveWorkerDeps = CronWorkerDeps

/**
 * Start the Brevo newsletter campaign archive worker.
 * Runs daily to fetch newly sent Brevo email campaigns, render each one's
 * HTML content to a PDF, and store it as a `newsletter` category document so
 * members can review past newsletters without needing the original email.
 *
 * The first run only records a cursor (current time) and archives nothing —
 * campaigns sent before the feature was enabled are not backfilled, since
 * those had already been archived manually.
 */
export const startBrevoCampaignArchiveWorker = defineWorker<BrevoCampaignArchiveWorkerDeps>({
  name: 'Brevo Campaign Archive Worker',
  envPrefix: 'BREVO_CAMPAIGN_ARCHIVE',
  // '0 6 * * *' = At 06:00 every day
  schedule: '0 6 * * *',
  scheduleDescription: 'daily at 06:00',
  runOnStartup: true,
  run: () => archiveNewCampaigns(),
})

export async function archiveNewCampaigns(): Promise<void> {
  const lastState = await getLastBrevoCampaignArchiveState()

  if (!lastState) {
    logger.info(
      'Brevo campaign archive worker: bootstrapping cursor, no campaigns will be archived',
    )
    await createBrevoCampaignArchiveState(new Date(), 0, 'SUCCESS')
    return
  }

  const runStartedAt = new Date()

  try {
    const campaigns = await brevoClient.getSentCampaigns(lastState.last_synced_at)
    logger.info(
      `Brevo campaign archive worker: found ${campaigns.length} sent campaign(s) to check`,
    )

    let archivedCount = 0
    for (const campaign of campaigns) {
      try {
        const archived = await archiveCampaign(campaign)
        if (archived) archivedCount++
      } catch (error) {
        logger.error(
          `Failed to archive Brevo campaign ${campaign.id} (${campaign.subject}):`,
          error,
        )
      }
    }

    await updateBrevoCampaignArchiveState(
      lastState.id,
      runStartedAt,
      lastState.campaigns_archived + archivedCount,
      'SUCCESS',
    )

    logger.info(`Brevo campaign archive worker: archived ${archivedCount} newsletter(s)`)
  } catch (error) {
    logger.error('Fatal error during Brevo campaign archive run:', error)
    await updateBrevoCampaignArchiveState(
      lastState.id,
      lastState.last_synced_at,
      lastState.campaigns_archived,
      'FAILED',
      error instanceof Error ? error.message : 'Unknown error',
    )
    throw error
  }
}

async function archiveCampaign(campaign: BrevoCampaign): Promise<boolean> {
  if (await isCampaignAlreadyArchived(campaign.id)) {
    logger.info(`Brevo campaign ${campaign.id} already archived, skipping`)
    return false
  }

  const detail = await brevoClient.getCampaignById(campaign.id)
  if (!detail.htmlContent) {
    logger.warn(`Brevo campaign ${campaign.id} has no htmlContent, skipping`)
    return false
  }

  const title = detail.subject || detail.name
  const publishedDate = (detail.sentDate ?? new Date().toISOString()).slice(0, 10)
  const pdfBuffer = await renderHtmlToPdf(detail.htmlContent)
  const fileName = `${slugify(title)}-${campaign.id}.pdf`

  const uploadResult = await storageService.uploadFile(
    pdfBuffer,
    fileName,
    'application/pdf',
    'newsletter',
  )

  await addDocument(
    {
      title,
      description: null,
      category: DocumentCategory.NEWSLETTER,
      documentUrl: uploadResult.url,
      publishedDate,
      isPublic: true,
      isArchived: false,
      tags: [`brevo-campaign-id:${campaign.id}`],
      fileName,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      storageKey: uploadResult.key,
    },
    SYSTEM_JWT_USER,
  )

  logger.info(`Archived Brevo campaign ${campaign.id} ("${title}") as a newsletter document`)
  return true
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'newsletter'
  )
}
