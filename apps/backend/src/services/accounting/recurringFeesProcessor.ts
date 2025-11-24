import { db } from '../../db/connection.ts'
import { getMembersForAnnualMembershipFee } from '../../db/member-queries.ts'
import {
  getFeeProcessingItem,
  insertFeeProcessingItem,
  insertOutboxItem,
  updateFeeProcessingItem,
} from '../../db/outbox-simplbooks-queries.ts'
import { SimplbooksEventType } from '../simplbooks/models.ts'
import { FeeProcessingStatus, RecurringFeeType } from '../simplbooks/models.ts'
import logger from '../../lib/logger.ts'
import { FeeProcessingError } from '../../exceptions/feeProcessingError.ts'
import { getCurrentYear } from '../simplbooks/simplbooksOutboxHandler.ts'

export const createAnnualEquipmentFeeForMember = async (memberId: string) => {
  const year = getCurrentYear()
  const feeType = RecurringFeeType.EQUIPMENT_FEE

  // Check if processing already exists or completed
  const existingProcess = await getFeeProcessingItem(feeType, year)

  if (existingProcess) {
    if (existingProcess.status === FeeProcessingStatus.PROCESSED) {
      throw new FeeProcessingError(
        `Annual equipment fees for year ${year} have already been processed on ${existingProcess.updated_at}`,
      )
    } else if (existingProcess.status === FeeProcessingStatus.IN_PROGRESS) {
      throw new FeeProcessingError(
        `Annual equipment fees for year ${year} are currently being processed (started at ${existingProcess.created_at})`,
      )
    }
  }

  // Use transaction to atomically check and insert the processing record
  try {
    await db.transaction().execute(async txn => {
      // Insert processing record - will fail if another process inserted it first (due to PK constraint)
      await insertFeeProcessingItem(txn, feeType, FeeProcessingStatus.IN_PROGRESS, year, memberId)
      await insertOutboxItem(txn, SimplbooksEventType.EQUIPMENT_INVOICE, { memberId, year })
      logger.info(
        `Started annual equipment fee invoice processing for year ${year} for member ${memberId}`,
      )
    })
  } catch (error: any) {
    // Check if it's a unique constraint violation (concurrent insert attempt)
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      throw new FeeProcessingError(
        `Annual equipment fees for year ${year} are already being processed by another instance`,
      )
    }
    throw error
  }

  // Mark processing as complete
  await updateFeeProcessingItem(feeType, FeeProcessingStatus.PROCESSED, year, memberId)

  logger.info(
    `Successfully queued annual equipment fee invoice for member ID: ${memberId} for year ${year}`,
  )

  return {
    year,
    memberId,
    status: FeeProcessingStatus.PROCESSED,
  }
}

export const createAnnualMemberFeesForMembers = async (memberId: string) => {
  const year = getCurrentYear()
  const feeType = RecurringFeeType.ANNUAL_FEE

  // Check if processing already exists or completed
  const existingProcess = await getFeeProcessingItem(feeType, year)

  if (existingProcess) {
    if (existingProcess.status === FeeProcessingStatus.PROCESSED) {
      throw new FeeProcessingError(
        `Annual fees for year ${year} have already been processed on ${existingProcess.updated_at}`,
      )
    } else if (existingProcess.status === FeeProcessingStatus.IN_PROGRESS) {
      throw new FeeProcessingError(
        `Annual fees for year ${year} are currently being processed (started at ${existingProcess.created_at})`,
      )
    }
  }

  // Use transaction to atomically check and insert the processing record
  try {
    await db.transaction().execute(async txn => {
      // Insert processing record - will fail if another process inserted it first (due to PK constraint)
      await insertFeeProcessingItem(txn, feeType, FeeProcessingStatus.IN_PROGRESS, year, memberId)

      logger.info(`Started annual fee processing for year ${year} by member ${memberId}`)
    })
  } catch (error: any) {
    // Check if it's a unique constraint violation (concurrent insert attempt)
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      throw new FeeProcessingError(
        `Annual fees for year ${year} are already being processed by another instance`,
      )
    }
    throw error
  }

  // Get all members with annual fees to be invoiced
  const membersToInvoice = await getMembersForAnnualMembershipFee(year)

  logger.info(`Found ${membersToInvoice.length} members to invoice for year ${year}`)

  // Iterate through members and push to outbox to create invoices
  await db.transaction().execute(async txn => {
    for (const member of membersToInvoice) {
      // Push outbox msg to create annual membership fee invoice
      await insertOutboxItem(txn, SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE, member)

      logger.debug(
        `Queued annual membership fee invoice creation for member ID: ${member.memberId} for year: ${year}`,
      )
    }
  })

  // Mark processing as complete
  await updateFeeProcessingItem(feeType, FeeProcessingStatus.PROCESSED, year, memberId)

  logger.info(
    `Successfully queued ${membersToInvoice.length} annual membership fee invoices for year ${year}`,
  )

  return {
    year,
    membersProcessed: membersToInvoice.length,
    status: FeeProcessingStatus.PROCESSED,
  }
}
