import 'dotenv/config'

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'

import { camelDb, db } from '../../src/db/connection.ts'
import { addExpenseAttachment } from '../../src/db/expense-attachment-queries.ts'
import { insertOutboxItem } from '../../src/db/outbox-simplbooks-queries.ts'
import { SimplbooksEventType } from '../../src/services/simplbooks/models.ts'

/**
 * The seven-module cluster — expense, expense-attachment, inventory, meeting,
 * mileage, occurrence, outbox-simplbooks (plus shop, which reaches into the outbox)
 * — had to move to camelDb in one commit. A transaction belongs to one Kysely
 * instance, so a `db.transaction()` handed to a function querying `camelDb` runs on a
 * separate connection: its writes commit independently and survive the rollback, with
 * nothing failing and no test noticing.
 *
 * The pairing below is the one that matters most in this cluster. `shop-queries`
 * writes a shop order and enqueues its SimplBooks invoicing event in a single
 * transaction, so a split here means an invoice event for an order that was rolled
 * back — a member billed for something they never bought. This exercises the same
 * shape with fixtures that do not require a whole order.
 *
 * See test/db/transaction-cluster.test.ts for the equivalent guard on cluster B, and
 * DATA_LAYER.md for why the route using the wrong instance is a compile error rather
 * than something a test can catch.
 */
describe('transaction cluster A: expense-attachment / outbox-simplbooks', () => {
  const storageKey = `ut-cluster-a-${Date.now()}`
  let claimId: string

  // Seeded rather than borrowed from whatever happens to be in the database. An
  // earlier version looked up any existing claim and returned early if it found none,
  // which meant that on a pruned dataset both tests passed having asserted nothing —
  // a rollback guard that silently stops guarding.
  beforeAll(async () => {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .limit(1)
      .executeTakeFirstOrThrow()

    const claim = await db
      .insertInto('accts.expense_claim')
      .values({
        member_id: 'Matti1',
        category_id: category.id,
        title: 'transaction cluster A fixture',
        ccy: 'EUR',
        status: 'DRAFT',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    claimId = claim.id
  })

  afterAll(async () => {
    await db.deleteFrom('accts.expense_claim').where('id', '=', claimId).execute()
  })

  afterEach(async () => {
    await db
      .deleteFrom('accts.expense_claim_attachment')
      .where('storage_key', '=', storageKey)
      .execute()
    await db
      .deleteFrom('accts.outbox_simplbooks')
      .where('payload', '@>', JSON.stringify({ storageKey }) as never)
      .execute()
      .catch(() => undefined)
  })

  const attachmentCount = async () =>
    Number(
      (
        await db
          .selectFrom('accts.expense_claim_attachment')
          .select((eb) => eb.fn.count('id').as('count'))
          .where('storage_key', '=', storageKey)
          .executeTakeFirstOrThrow()
      ).count,
    )

  const outboxCount = async () =>
    Number(
      (
        await db
          .selectFrom('accts.outbox_simplbooks')
          .select((eb) => eb.fn.count('id').as('count'))
          .where('payload', '@>', JSON.stringify({ storageKey }) as never)
          .executeTakeFirstOrThrow()
      ).count,
    )

  it('commits both modules together', async () => {
    await camelDb.transaction().execute(async (trx) => {
      await addExpenseAttachment(
        claimId,
        { storageKey, fileName: 'cluster-a.pdf', fileSize: 1, mimeType: 'application/pdf' },
        trx,
      )
      await insertOutboxItem(SimplbooksEventType.SHOP_ORDER_INVOICE, { storageKey }, trx)
    })

    expect(await attachmentCount()).toBe(1)
    expect(await outboxCount()).toBe(1)
  })

  // If either module were still on `db` while the caller opened a `camelDb`
  // transaction, its write would land on a separate connection and outlive the
  // rollback — leaving, in the real shop-order path, an invoicing event for an order
  // that never existed.
  it('rolls both modules back when the transaction fails', async () => {
    await expect(
      camelDb.transaction().execute(async (trx) => {
        await addExpenseAttachment(
          claimId,
          { storageKey, fileName: 'cluster-a.pdf', fileSize: 1, mimeType: 'application/pdf' },
          trx,
        )
        await insertOutboxItem(SimplbooksEventType.SHOP_ORDER_INVOICE, { storageKey }, trx)
        throw new Error('forced rollback')
      }),
    ).rejects.toThrow('forced rollback')

    expect(await attachmentCount()).toBe(0)
    expect(await outboxCount()).toBe(0)
  })
})
