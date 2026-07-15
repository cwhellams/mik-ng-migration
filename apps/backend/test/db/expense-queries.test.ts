import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import { getPendingExpenseClaimsCount } from '../../src/db/expense-queries.ts'
import { ExpenseClaimStatus } from '../../src/routes/expenses/models.ts'

// ── Seed data IDs ─────────────────────────────────────────────────────────────

const MEMBER_ID = 'Juha1'
const CATEGORY_CODE = 'misc'

// ── getPendingExpenseClaimsCount ───────────────────────────────────────────────

describe('getPendingExpenseClaimsCount', () => {
  const insertedClaimIds: string[] = []

  async function insertClaim(status: ExpenseClaimStatus) {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', CATEGORY_CODE)
      .executeTakeFirstOrThrow()

    const claim = await db
      .insertInto('accts.expense_claim')
      .values({
        member_id: MEMBER_ID,
        category_id: category.id,
        title: 'Test claim',
        status,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    insertedClaimIds.push(claim.id)
    return claim.id
  }

  afterEach(async () => {
    await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
    insertedClaimIds.length = 0
  })

  it('counts SUBMITTED and PENDING_INFO claims but not other statuses', async () => {
    const before = await getPendingExpenseClaimsCount()

    await insertClaim(ExpenseClaimStatus.SUBMITTED)
    await insertClaim(ExpenseClaimStatus.PENDING_INFO)
    await insertClaim(ExpenseClaimStatus.DRAFT)
    await insertClaim(ExpenseClaimStatus.APPROVED)
    await insertClaim(ExpenseClaimStatus.REJECTED)
    await insertClaim(ExpenseClaimStatus.SYNCED)

    const after = await getPendingExpenseClaimsCount()
    expect(after).toBe(before + 2)
  })

  it('returns unchanged count when no pending claims are added', async () => {
    const before = await getPendingExpenseClaimsCount()

    await insertClaim(ExpenseClaimStatus.DRAFT)

    const after = await getPendingExpenseClaimsCount()
    expect(after).toBe(before)
  })
})
