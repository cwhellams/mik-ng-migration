import { MIKMemberTypes, type Member } from '../../routes/members/models.ts'
import type { InvoicePost } from '../simplbooks/models.ts'
import * as simplbooksApiClient from '../../../src/services/simplbooks/simplbooksApiClient.ts'

import {
  ART_JOINING_FEE,
  ART_JUNIOR_JOINING_FEE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_JOINING_FEE,
  CC_MEMBERSHIP_FEE,
} from './config.ts'

import { createInvoicePostPayload } from './invoiceTemplate.ts'

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

const createTasksFromArticleCodes = async (
  articleCodes: string[],
): Promise<InvoicePost['Tasks']> => {
  const tasks: InvoicePost['Tasks'] = []

  for (const articleCode of articleCodes) {
    const article = await simplbooksApiClient.getItemByCode(articleCode)

    if (!article) {
      throw new Error(`Article with code '${articleCode}' not found in SimplBooks`)
    }

    tasks.push({
      Task: {
        article_id: article.id,
        amount: 1,
        price_per_unit: article.markup_value,
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

export const createNewMemberFeesInvoicePayload = async (member: Member): Promise<InvoicePost> => {
  //TODO : Move this to a regular batch job which polls simplbooks and store to our DB
  const articleAnnualFeeCode = getMemberFeeSimplBooksCodeFromMemberType(member.memberType)
  const articleJoiningFeeCode = getJoiningFeeSimplBooksCodeFromMemberType(member.memberType)

  const tasks = await createTasksFromArticleCodes([articleJoiningFeeCode, articleAnnualFeeCode])

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: tasks,
  }

  return invoice
}

export const createAnnualMemberFeeInvoicePayload = async (member: Member): Promise<InvoicePost> => {
  //TODO : Move this to a regular batch job which polls simplbooks and store to our DB
  const articleAnnualFeeCode = getMemberFeeSimplBooksCodeFromMemberType(member.memberType)

  const tasks = await createTasksFromArticleCodes([articleAnnualFeeCode])

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: tasks,
  }

  return invoice
}
