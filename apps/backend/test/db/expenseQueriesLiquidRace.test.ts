import 'dotenv/config'
import { jest } from '@jest/globals'

/**
 * The race #1119 opened: `loadClaimableFuelRecords` reads a liquid record's
 * claim status with a plain, unlocked SELECT *before* the write transaction
 * opens. Two concurrent submissions can both pass that pre-check for the same
 * not-yet-claimed record; only one of the later `linkRecordsToClaim` calls
 * inside the transaction actually wins (its own `WHERE expenseClaimId IS
 * NULL` guard sees to that), but the loser used to still persist a claim with
 * line items derived from a record it was never linked to.
 *
 * `linkRecordsToClaim` lives in liquid-queries.ts, so it's mocked here to
 * force the race outcome deterministically rather than trying to win an
 * actual concurrency race against Postgres.
 */

jest.mock('../../src/db/liquid-queries.ts', () => ({
  linkRecordsToClaim: jest
    .fn<(...args: any[]) => Promise<{ linked: string[]; rejected: string[] }>>()
    .mockResolvedValue({ linked: [], rejected: ['a-record-someone-else-just-claimed'] }),
  unlinkRecordsFromClaim: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(),
  getRecordsForClaim: jest.fn<(...args: any[]) => Promise<unknown[]>>().mockResolvedValue([]),
}))

const { db } = await import('../../src/db/connection.ts')
const { createExpenseClaim } = await import('../../src/db/expense-queries.ts')

const MEMBER_ID = 'Juha1'
const TITLE = 'LIQUID-RACE-TEST claim'

describe('createExpenseClaim — the linkRecordsToClaim race', () => {
  afterEach(async () => {
    await db.deleteFrom('accts.expenseClaim').where('title', '=', TITLE).execute()
    jest.clearAllMocks()
  })

  it('rolls back the whole claim rather than persisting one with unlinked fuel records', async () => {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()

    await expect(
      createExpenseClaim(
        {
          categoryId: category.id,
          title: TITLE,
          lineItems: [],
          liquidRecordIds: ['a-record-someone-else-just-claimed'],
        } as any,
        {
          memberId: MEMBER_ID,
          lastName: 'Seppälä',
          email: 'juha1@mik.fi',
          roles: [],
          permissions: [],
          canMakeReservations: false,
        },
      ),
    ).rejects.toThrow()

    const rows = await db
      .selectFrom('accts.expenseClaim')
      .select('id')
      .where('title', '=', TITLE)
      .execute()
    expect(rows).toHaveLength(0)
  })
})
