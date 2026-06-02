import { MIKMemberTypes, type InvoiceMember } from '../../routes/members/models.ts'
import type { InvoicePost } from '../simplbooks/models.ts'
import * as simplbooksApiClient from '../simplbooks/simplbooksApiClient.ts'

import {
  ART_JOINING_FEE,
  ART_JUNIOR_JOINING_FEE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_JOINING_FEE,
  CC_MEMBERSHIP_FEE,
  ART_EQUIP_FEE_CODE,
} from './config.ts'

import { createInvoicePostPayload } from './invoiceTemplate.ts'
import {
  HALF_YEAR_DISCOUNT_PERCENT,
  isAfterEquipmentFeeDiscountDate,
  isAfterMembershipFeeDiscountDate,
} from '../../util/feeDiscounts.ts'

const getMemberFeeSimplBooksCodeFromMemberType = (memberType: MIKMemberTypes) => {
  switch (memberType) {
    case MIKMemberTypes.FLYING:
      return ART_MEMBER_FEE_CODE
    case MIKMemberTypes.JUNIOR:
      return ART_JUNIOR_MEMBER_FEE_CODE
    case MIKMemberTypes.NONFLYING:
      return ART_SUPPORTING_MEMBER_FEE_CODE
    default:
      throw new Error('Unsupported Member Type for Fee invoicing')
  }
}

const getJoiningFeeSimplBooksCodeFromMemberType = (memberType: MIKMemberTypes) => {
  switch (memberType) {
    case MIKMemberTypes.FLYING:
      return ART_JOINING_FEE
    case MIKMemberTypes.JUNIOR:
      return ART_JUNIOR_JOINING_FEE
    case MIKMemberTypes.NONFLYING:
      return ART_SUPPORTING_MEMBER_JOINING_FEE
    default:
      throw new Error('Unsupported Member Type for Fee invoicing')
  }
}

interface ArticleTaskInput {
  code: string
  discountPercent?: number
}

const createTasksFromArticleInputs = async (
  articles: ArticleTaskInput[],
): Promise<InvoicePost['Tasks']> => {
  const tasks: InvoicePost['Tasks'] = []

  for (const { code, discountPercent } of articles) {
    const article = await simplbooksApiClient.getItemByCode(code)

    if (!article) {
      throw new Error(`Article with code '${code}' not found in SimplBooks`)
    }

    tasks.push({
      Task: {
        article_id: article.id,
        amount: 1,
        price_per_unit: article.markup_value,
        ...(discountPercent !== undefined && discountPercent > 0
          ? { discount: discountPercent }
          : {}),
      },
      Projects: [
        {
          code: CC_MEMBERSHIP_FEE,
        },
      ],
    })
  }

  return tasks
}

const createTasksFromArticleCodes = async (
  articleCodes: string[],
): Promise<InvoicePost['Tasks']> => {
  return createTasksFromArticleInputs(articleCodes.map(code => ({ code })))
}

export const createNewMemberFeesInvoicePayload = async (
  member: InvoiceMember,
  date: Date,
): Promise<InvoicePost> => {
  const articleAnnualFeeCode = getMemberFeeSimplBooksCodeFromMemberType(member.memberType)
  const articleJoiningFeeCode = getJoiningFeeSimplBooksCodeFromMemberType(member.memberType)

  const membershipFeeDiscountPercent = isAfterMembershipFeeDiscountDate(date)
    ? HALF_YEAR_DISCOUNT_PERCENT
    : undefined

  const tasks = await createTasksFromArticleInputs([
    { code: articleJoiningFeeCode },
    { code: articleAnnualFeeCode, discountPercent: membershipFeeDiscountPercent },
  ])

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: tasks,
  }

  return invoice
}

export const createAnnualMemberFeeInvoicePayload = async (
  member: InvoiceMember,
): Promise<InvoicePost> => {
  const articleAnnualFeeCode = getMemberFeeSimplBooksCodeFromMemberType(member.memberType)

  const tasks = await createTasksFromArticleCodes([articleAnnualFeeCode])

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: tasks,
  }

  return invoice
}

export const createAnnualMemberFeeWithEquipmentFeeInvoicePayload = async (
  member: InvoiceMember,
  date: Date,
): Promise<InvoicePost> => {
  const articleAnnualFeeCode = getMemberFeeSimplBooksCodeFromMemberType(member.memberType)

  const equipmentFeeDiscountPercent = isAfterEquipmentFeeDiscountDate(date)
    ? HALF_YEAR_DISCOUNT_PERCENT
    : undefined

  const tasks = await createTasksFromArticleInputs([
    { code: articleAnnualFeeCode },
    { code: ART_EQUIP_FEE_CODE, discountPercent: equipmentFeeDiscountPercent },
  ])

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: tasks,
  }

  return invoice
}

export const createAnnualEquipmentFeeInvoicePayload = async (
  member: InvoiceMember,
  date: Date,
): Promise<InvoicePost> => {
  const equipmentFeeDiscountPercent = isAfterEquipmentFeeDiscountDate(date)
    ? HALF_YEAR_DISCOUNT_PERCENT
    : undefined

  const tasks = await createTasksFromArticleInputs([
    { code: ART_EQUIP_FEE_CODE, discountPercent: equipmentFeeDiscountPercent },
  ])

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: tasks,
  }

  return invoice
}
