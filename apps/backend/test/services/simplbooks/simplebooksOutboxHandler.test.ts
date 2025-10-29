import { jest } from '@jest/globals'

import { randomUUID } from 'crypto'
import {
  SimplbooksEventType,
  type AcctsOutboxSimplbooks,
} from '../../../src/services/simplbooks/models.ts'
import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import {
  checkAndClearStuckMessages,
  dispatchOutboxMsg,
} from '../../../src/services/simplbooks/simplbooksOutboxHandler.ts'
import { simplbooksApiClient } from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import { mockSimplbooksGet, mockSimplbooksPost } from '../../__mocks__/simplbooksMock.ts'
import {
  checkForOutboxStuckRows,
  deleteCreatedInvoice,
  deleteSimplbooksOutbox,
  expectBillingIdSet,
  expectInvoiceForMemberFee,
  expectOutbox1Row,
  insertStuckRowToOutbox,
  revertBillingIdChanges,
} from '../../db/__helpers__/simplbooksDbHelpers.ts'

const newMemberId = 'Anna1'

const flyingMember: Member = {
  memberId: newMemberId,
  memberType: MIKMemberTypes.FLYING,
  email: 'jonny.rotten@spistols.com',
  firstName: 'Jonny',
  lastName: 'Rotten',
  streetAddress: 'Isotie 10 B2',
  postcode: '00340',
  townCity: 'Nummela',
  lang: MIKLang.FI,
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: 'admin',
  updatedAt: '2024-01-01T00:00:00Z',
  updatedBy: 'admin',
  isTrainingProgramPilot: false,
  canMakeReservations: true,
  isMembershipApproved: true,
  memberSince: '2021-01-01',
  roles: [],
}

const obMsgAddMember: AcctsOutboxSimplbooks = {
  created_at_utc: new Date(),
  event_type: SimplbooksEventType.ADD_MEMBER,
  id: randomUUID(),
  payload: flyingMember,
  status: 'PENDING',
}

const obMsgMembershipFeeInvoice: AcctsOutboxSimplbooks = {
  created_at_utc: new Date(),
  event_type: SimplbooksEventType.MEMBERSHIP_FEE,
  id: randomUUID(),
  payload: { ...flyingMember, billingId: '8766623' },
  status: 'PENDING',
}

describe('Simplbooks Outbox Handler tests', () => {
  beforeAll(async () => {
    await deleteSimplbooksOutbox()
    jest.clearAllMocks()

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(mockSimplbooksPost)
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)
  })

  afterEach(async () => {
    await deleteSimplbooksOutbox()
    jest.clearAllMocks()
  })

  it('dispatches outbox messages for add member', async () => {
    await dispatchOutboxMsg(obMsgAddMember)

    await expectBillingIdSet(newMemberId)
    await expectOutbox1Row(SimplbooksEventType.MEMBERSHIP_FEE)

    await revertBillingIdChanges(newMemberId, 'BILL004')
  })

  it('dispatches outbox messages for add member', async () => {
    await dispatchOutboxMsg(obMsgMembershipFeeInvoice)

    await expectInvoiceForMemberFee(newMemberId)
    await revertBillingIdChanges(newMemberId, 'BILL004')
    await deleteCreatedInvoice()
  })

  it('checks and clears stuck outbox messages ', async () => {
    await insertStuckRowToOutbox()
    await checkAndClearStuckMessages()
    await checkForOutboxStuckRows()
  })
})
