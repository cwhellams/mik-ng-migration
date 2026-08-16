import { jest } from '@jest/globals'
import { randomUUID } from 'crypto'
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

// Issue #1071: the purchase sent to SimplBooks must use the claim's submit date as the
// accounting/bookkeeping date (transaction_date, subject to period locking), not the
// member-entered expense date, which can be arbitrarily old and land in an
// already-closed period.
describe('createExpenseReimbursement bookkeeping date (issue #1071)', () => {
  let claimId: string
  let capturedPurchase: { Purchase: { created: string; transaction_date: string } } | undefined

  beforeEach(async () => {
    resetSimplbooksMockCounters()
    capturedPurchase = undefined

    // Dry-run (set in apps/backend/.env for local dev) would short-circuit before the
    // purchase payload is even built — this test exercises that exact code path, so it
    // must run with dry-run off, same as the rest of this file's mocked-client tests.
    process.env.SIMPLBOOKS_DRY_RUN = 'false'

    jest.spyOn(simplbooksApiClient, 'post').mockImplementation(async (url: string, data?: any) => {
      if (url === '/purchases/create') capturedPurchase = data
      return mockSimplbooksPost(url, data)
    })
    jest.spyOn(simplbooksApiClient, 'get').mockImplementation(mockSimplbooksGet)

    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'misc')
      .executeTakeFirstOrThrow()
    const claim = await db
      .insertInto('accts.expenseClaim')
      .values({
        memberId: MEMBER_ID,
        categoryId: category.id,
        title: 'Bookkeeping date test',
        status: ExpenseClaimStatus.SUBMITTED,
        submittedAt: new Date('2026-08-01T12:00:00.000Z'),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    claimId = claim.id
  })

  afterEach(async () => {
    await db.deleteFrom('accts.expenseClaim').where('id', '=', claimId).execute()
    jest.clearAllMocks()
    delete process.env.SIMPLBOOKS_DRY_RUN
  })

  function makeOutboxMsg(payload: Record<string, unknown>): AcctsOutboxSimplbooks {
    return {
      createdAtUtc: new Date(),
      eventType: SimplbooksEventType.REIMBURSEMENT,
      id: randomUUID(),
      payload: {
        claimId,
        number: claimId,
        memberId: MEMBER_ID,
        categoryCode: 'misc',
        currency: 'EUR',
        lineItems: [{ description: 'Test item', quantity: 1, unitPrice: 10 }],
        ...payload,
      },
      status: SimplbooksStatus.PENDING,
    }
  }

  it('sends the claim submit date as transaction_date and the expense date as created', async () => {
    await dispatchOutboxMsg(
      makeOutboxMsg({
        transactionDate: '2026-06-10', // the (old) member-entered expense date
        submittedAt: '2026-08-01T12:00:00.000Z', // the (recent) claim submit date
      }),
    )

    expect(capturedPurchase).toBeDefined()
    expect(capturedPurchase!.Purchase.created).toBe('2026-06-10')
    expect(capturedPurchase!.Purchase.transaction_date).toBe('2026-08-01')
  })

  it('falls back to today for whichever date is missing', async () => {
    const today = new Date().toISOString().slice(0, 10)

    await dispatchOutboxMsg(makeOutboxMsg({ transactionDate: '2026-06-10' }))

    expect(capturedPurchase).toBeDefined()
    expect(capturedPurchase!.Purchase.created).toBe('2026-06-10')
    expect(capturedPurchase!.Purchase.transaction_date).toBe(today)
  })
})
