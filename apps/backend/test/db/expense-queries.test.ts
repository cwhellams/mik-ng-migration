import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import { getAllExpenseClaims, getPendingExpenseClaimsCount } from '../../src/db/expense-queries.ts'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'

// ── Seed data IDs ─────────────────────────────────────────────────────────────

const MEMBER_ID = 'Juha1'
const CATEGORY_CODE = 'misc'

// ── getPendingExpenseClaimsCount ───────────────────────────────────────────────

describe('getPendingExpenseClaimsCount', () => {
  const insertedClaimIds: string[] = []

  async function insertClaim(status: ExpenseClaimStatus) {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', CATEGORY_CODE)
      .executeTakeFirstOrThrow()

    const claim = await db
      .insertInto('accts.expenseClaim')
      .values({
        memberId: MEMBER_ID,
        categoryId: category.id,
        title: 'Test claim',
        status,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    insertedClaimIds.push(claim.id)
    return claim.id
  }

  afterEach(async () => {
    await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
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

// ── getAllExpenseClaims ──────────────────────────────────────────────────────

describe('getAllExpenseClaims', () => {
  const insertedClaimIds: string[] = []
  const originalFieldEncryptionKey = process.env.FIELD_ENCRYPTION_KEY

  beforeAll(() => {
    // Deterministic key so encrypt/decrypt round-trips in this suite don't depend on
    // whatever (if anything) is set in the local .env / CI secrets.
    process.env.FIELD_ENCRYPTION_KEY = '0'.repeat(64)
  })

  afterAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = originalFieldEncryptionKey
  })

  // Corrupts the auth tag of a value produced by encryptField, reproducing the AES-GCM
  // "Unsupported state or unable to authenticate data" failure seen in production - as
  // opposed to a malformed value, which only exercises the "Invalid encrypted field
  // format" branch of decryptField.
  function corruptAuthTag(encrypted: string): string {
    const [iv, data, tag] = encrypted.split(':')
    const tagBytes = Buffer.from(tag, 'base64')
    tagBytes[0] ^= 0xff
    return [iv, data, tagBytes.toString('base64')].join(':')
  }

  async function insertClaim(hetuEncrypted: string | null) {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', CATEGORY_CODE)
      .executeTakeFirstOrThrow()

    const claim = await db
      .insertInto('accts.expenseClaim')
      .values({
        memberId: MEMBER_ID,
        categoryId: category.id,
        title: 'Test claim with HETU',
        status: ExpenseClaimStatus.APPROVED,
        hetuEncrypted,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    insertedClaimIds.push(claim.id)
    return claim.id
  }

  afterEach(async () => {
    await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
    insertedClaimIds.length = 0
  })

  // A claim whose hetu_encrypted can't be decrypted (corrupted ciphertext, or encrypted
  // under a key that's since rotated) must not take down the whole admin list — see the
  // "Unsupported state or unable to authenticate data" crash on /admin/all?status=all.
  it('omits hetu instead of throwing when a claim has undecryptable hetuEncrypted', async () => {
    const { encryptField } = await import('../../src/lib/fieldEncryption.ts')
    const claimId = await insertClaim(corruptAuthTag(encryptField('010199-1234')))

    const result = await getAllExpenseClaims({ page: 1, pageSize: 20 })

    const claim = result.claims.find((c) => c.id === claimId)
    expect(claim).toBeDefined()
    expect(claim!.hetu).toBeUndefined()
  })

  it('still masks hetu for claims with valid encrypted values', async () => {
    const { encryptField } = await import('../../src/lib/fieldEncryption.ts')
    const claimId = await insertClaim(encryptField('010199-1234'))

    const result = await getAllExpenseClaims({ page: 1, pageSize: 20 })

    const claim = result.claims.find((c) => c.id === claimId)
    expect(claim).toBeDefined()
    expect(claim!.hetu).toBeDefined()
    expect(claim!.hetu).not.toBe('010199-1234')
  })

  it('fails the request instead of silently omitting hetu when FIELD_ENCRYPTION_KEY is misconfigured', async () => {
    const { encryptField } = await import('../../src/lib/fieldEncryption.ts')
    const claimId = await insertClaim(encryptField('010199-1234'))

    process.env.FIELD_ENCRYPTION_KEY = 'not-a-valid-key'
    try {
      await expect(getAllExpenseClaims({ page: 1, pageSize: 20 })).rejects.toThrow(
        /FIELD_ENCRYPTION_KEY/,
      )
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = '0'.repeat(64)
    }

    // sanity check the claim is still findable once the key is restored
    const result = await getAllExpenseClaims({ page: 1, pageSize: 20 })
    expect(result.claims.find((c) => c.id === claimId)).toBeDefined()
  })
})
