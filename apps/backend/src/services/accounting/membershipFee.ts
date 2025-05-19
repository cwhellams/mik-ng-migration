import { MIKMemberTypes, type Member } from '../../routes/members/models.ts'
import type { InvoicePost } from '../simplbooks/models.ts'
import * as simplbooksApiClient from '../../../src/services/simplbooks/simplbooksApiClient.ts'

import {
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
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

export const createMembershipFeeInvoicePayload = async (member: Member): Promise<InvoicePost> => {
  //TODO : Move this to a regular batch job which polls simplbooks and store to our DB
  const article = await simplbooksApiClient.getItemByCode(
    getMemberFeeSimplBooksCodeFromMemberType(member.memberType),
  )

  const invoice: InvoicePost = {
    Invoice: createInvoicePostPayload(member, true),
    Tasks: [
      {
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
      },
    ],
  }

  return invoice
}
