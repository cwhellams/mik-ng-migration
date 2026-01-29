import {
  getFeeProcessingItemForMember,
  getMemberById,
  getMembersForAnnualMembershipFee,
} from '../../db/member-queries.ts'
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

export const isRecurringFeeAlreadyCreated = async (
  feeType: RecurringFeeType,
  year: number,
  memberId: string,
): Promise<boolean> => {
  const existingProcess = await getFeeProcessingItemForMember(feeType, year, memberId)

  if (existingProcess) {
    logger.warn(
      `Annual equipment fee invoice for year ${year} has already been created on ${existingProcess.created_at}}`,
    )
    return true
  }
  return false
}

export const createAnnualEquipmentFeeForMember = async (memberId: string) => {
  const year = getCurrentYear()

  logger.info(
    `Started annual equipment fee invoice processing for year ${year} for member ${memberId}`,
  )

  const alreadyCreated = await isRecurringFeeAlreadyCreated(
    RecurringFeeType.EQUIPMENT_FEE,
    year,
    memberId,
  )
  if (alreadyCreated) {
    throw new FeeProcessingError(
      `Annual equipment fee invoice for year ${year} has already been created.`,
    )
  }
  const member = await getMemberById(memberId)
  await insertOutboxItem(SimplbooksEventType.EQUIPMENT_INVOICE, member)

  logger.info(
    `Successfully queued annual equipment fee invoice for member ID: ${memberId} for year ${year}`,
  )

  return {
    year,
    memberId,
    status: FeeProcessingStatus.PROCESSED,
  }
}

const validateFeeProcessingNotInProgressOrAlreadyRun = async (
  feeType: RecurringFeeType,
  year: number,
): Promise<void> => {
  const existingProcess = await getFeeProcessingItem(feeType, year)

  if (!existingProcess) {
    return
  }

  if (existingProcess.status === FeeProcessingStatus.PROCESSED) {
    throw new FeeProcessingError(
      `Annual fees for year ${year} have already been processed on ${existingProcess.updated_at}`,
    )
  }

  if (existingProcess.status === FeeProcessingStatus.IN_PROGRESS) {
    throw new FeeProcessingError(
      `Annual fees for year ${year} are currently being processed (started at ${existingProcess.created_at})`,
    )
  }
}

const startFeeProcessing = async (
  feeType: RecurringFeeType,
  year: number,
  memberId: string,
): Promise<void> => {
  try {
    await insertFeeProcessingItem(feeType, FeeProcessingStatus.IN_PROGRESS, year, memberId)
    logger.info(`Started annual fee processing for year ${year} by member ${memberId}`)
  } catch (error: any) {
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      throw new FeeProcessingError(
        `Annual fees for year ${year} are already being processed by another instance`,
      )
    }
    throw error
  }
}

const queueMemberInvoices = async (membersToInvoice: any[], year: number): Promise<void> => {
  logger.info(`Found ${membersToInvoice.length} members to invoice for year ${year}`)

  for (const member of membersToInvoice) {
    await insertOutboxItem(SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE, member)

    logger.debug(
      `Queued annual membership fee invoice creation for member ID: ${member.memberId} for year: ${year}`,
    )
  }
}

const completeFeeProcessing = async (
  feeType: RecurringFeeType,
  year: number,
  memberId: string,
  memberCount: number,
): Promise<void> => {
  await updateFeeProcessingItem(feeType, FeeProcessingStatus.PROCESSED, year, memberId)
  logger.info(`Successfully queued ${memberCount} annual membership fee invoices for year ${year}`)
}

export const createAnnualMemberFeesForMembers = async (memberId: string) => {
  const year = getCurrentYear()
  const feeType = RecurringFeeType.ANNUAL_FEE

  await validateFeeProcessingNotInProgressOrAlreadyRun(feeType, year)

  await startFeeProcessing(feeType, year, memberId)

  const membersToInvoice = await getMembersForAnnualMembershipFee(year)

  await queueMemberInvoices(membersToInvoice, year)

  await completeFeeProcessing(feeType, year, memberId, membersToInvoice.length)

  return {
    year,
    membersProcessed: membersToInvoice.length,
    status: FeeProcessingStatus.PROCESSED,
  }
}
