import { jest } from '@jest/globals'
import { randomUUID } from 'crypto'
import { sql } from 'kysely'
import {
  SimplbooksEventType,
  SimplbooksStatus,
  type AcctsOutboxSimplbooks,
} from '../../../src/services/simplbooks/models.ts'
import { dispatchOutboxMsg } from '../../../src/services/simplbooks/simplbooksOutboxHandler.ts'
import { simplbooksApiClient } from '../../../src/services/simplbooks/simplbooksApiClient.ts'
import {
  mockSimplbooksGet,
  mockSimplbooksPost,
  resetSimplbooksMockCounters,
} from '../../__mocks__/simplbooksMock.ts'
import { db } from '../../../src/db/connection.ts'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'

const MEMBER_ID = 'Juha1'

// Issue #955: club-card fuel counts toward the same local-price cap as member-paid fuel,
// so when club-card spend alone exceeds the cap the balance goes back the other way —
// the member owes the club, and gets an invoice instead of a reimbursement.
describe('createClubFuelRecoveryInvoice (issue #955)', () => {
  let claimId: string
  // Int8 column — kysely types these as strings.
  const createdInvoiceIds: string[] = []
  let capturedInvoice:
    { Invoice: { client_id: number }; Tasks: { Task: Record<string, unknown> }[] } | undefined

  // Reset once, not per test: the mock hands out invoice ids from a counter, and
  // accts.invoice rows written by an earlier test in this file are still around.
  beforeAll(() => {
    resetSimplbooksMockCounters()
  })

  beforeEach(async () => {
    capturedInvoice = undefined
    process.env.SIMPLBOOKS_DRY_RUN = 'false'

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(async (url: string, data?: any) => {
      const response = await mockSimplbooksPost(url, data)
      if (url === '/invoices/create') {
        capturedInvoice = data
        // Remembered so afterEach can delete exactly the rows this test wrote — the
        // seeded test data has its own MISC invoice for this member that other suites
        // count on.
        createdInvoiceIds.push(String(response.data.inserted_id))
      }
      return response
    })
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)

    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()
    const claim = await db
      .insertInto('accts.expenseClaim')
      .values({
        memberId: MEMBER_ID,
        categoryId: category.id,
        title: 'Club card fuel over the cap',
        status: ExpenseClaimStatus.APPROVED,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    claimId = claim.id
  })

  afterEach(async () => {
    await db.deleteFrom('accts.expenseClaim').where('id', '=', claimId).execute()
    await db
      .deleteFrom('accts.outboxSimplbooks')
      .where('eventType', '=', SimplbooksEventType.SEND_INVOICE_PDF)
      .where(sql<boolean>`payload ->> 'memberId' = ${MEMBER_ID}`)
      .execute()
    if (createdInvoiceIds.length > 0) {
      await db
        .deleteFrom('accts.invoice')
        .where('memberId', '=', MEMBER_ID)
        .where('id', 'in', createdInvoiceIds)
        .execute()
      createdInvoiceIds.length = 0
    }
    jest.clearAllMocks()
    delete process.env.SIMPLBOOKS_DRY_RUN
  })

  function makeOutboxMsg(payload: Record<string, unknown> = {}): AcctsOutboxSimplbooks {
    return {
      createdAtUtc: new Date(),
      eventType: SimplbooksEventType.CLUB_FUEL_RECOVERY,
      id: randomUUID(),
      payload: {
        claimId,
        memberId: MEMBER_ID,
        amount: 100,
        articleId: 42,
        costCentreCode: 'OH-STL',
        description: 'Club card fuel above local price cap',
        ...payload,
      },
      status: SimplbooksStatus.PENDING,
    }
  }

  it('invoices the member for the amount owed, on the claim’s own article and cost centre', async () => {
    await dispatchOutboxMsg(makeOutboxMsg())

    expect(capturedInvoice).toBeDefined()
    expect(capturedInvoice!.Tasks).toHaveLength(1)
    expect(capturedInvoice!.Tasks[0].Task).toMatchObject({
      article_id: 42,
      amount: 1,
      price_per_unit: 100,
      name: 'Club card fuel above local price cap',
    })
    expect(capturedInvoice!.Tasks[0]).toMatchObject({ Projects: [{ code: 'OH-STL' }] })
  })

  it('still invoices when the claim had no article or cost centre to inherit', async () => {
    await dispatchOutboxMsg(makeOutboxMsg({ articleId: null, costCentreCode: null }))

    expect(capturedInvoice).toBeDefined()
    expect(capturedInvoice!.Tasks[0].Task).not.toHaveProperty('article_id')
    expect(capturedInvoice!.Tasks[0]).toMatchObject({ Projects: [] })
  })

  it('rejects a non-positive amount rather than raising a zero-value invoice', async () => {
    await expect(dispatchOutboxMsg(makeOutboxMsg({ amount: 0 }))).rejects.toThrow()
    expect(capturedInvoice).toBeUndefined()
  })
})
