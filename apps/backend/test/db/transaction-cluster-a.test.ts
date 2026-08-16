import 'dotenv/config'

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import { addExpenseAttachment } from '../../src/db/expense-attachment-queries.ts'
import { insertOutboxItem } from '../../src/db/outbox-simplbooks-queries.ts'
import { SimplbooksEventType } from '../../src/services/simplbooks/models.ts'

/**
 * expense, expense-attachment, inventory, meeting, mileage, occurrence and
 * outbox-simplbooks (plus shop, which reaches into the outbox) pass transactions
 * across module boundaries.
 *
 * What this guards is that each module *uses the executor it was handed* rather than
 * reaching for the module-level `db`. A `db.transaction()` runs on its own connection,
 * so a function that quietly ignores the transaction it was given writes outside it:
 * those writes commit independently and survive the rollback, with nothing failing and
 * no test noticing.
 *
 * The pairing below is the one that matters most here. `shop-queries` writes a shop
 * order and enqueues its SimplBooks invoicing event in a single transaction, so a split
 * means an invoice event for an order that was rolled back — a member billed for
 * something they never bought. This exercises the same shape with fixtures that do not
 * require a whole order.
 *
 * See test/db/transaction-cluster.test.ts for the equivalent guard on the aircraft-hil
 * cluster. (Both were written during issue #1115 phase 5, when a transaction
 * additionally could not span the two Kysely instances that then existed. That hazard
 * went with the second instance; the executor-plumbing one did not.)
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
      .selectFrom('accts.expenseCategory')
      .select('id')
      .limit(1)
      .executeTakeFirstOrThrow()

    const claim = await db
      .insertInto('accts.expenseClaim')
      .values({
        memberId: 'Matti1',
        categoryId: category.id,
        title: 'transaction cluster A fixture',
        ccy: 'EUR',
        status: 'DRAFT',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    claimId = claim.id
  })

  afterAll(async () => {
    await db.deleteFrom('accts.expenseClaim').where('id', '=', claimId).execute()
  })

  afterEach(async () => {
    await db
      .deleteFrom('accts.expenseClaimAttachment')
      .where('storageKey', '=', storageKey)
      .execute()
    await db
      .deleteFrom('accts.outboxSimplbooks')
      .where('payload', '@>', JSON.stringify({ storageKey }) as never)
      .execute()
      .catch(() => undefined)
  })

  const attachmentCount = async () =>
    Number(
      (
        await db
          .selectFrom('accts.expenseClaimAttachment')
          .select((eb) => eb.fn.count('id').as('count'))
          .where('storageKey', '=', storageKey)
          .executeTakeFirstOrThrow()
      ).count,
    )

  const outboxCount = async () =>
    Number(
      (
        await db
          .selectFrom('accts.outboxSimplbooks')
          .select((eb) => eb.fn.count('id').as('count'))
          .where('payload', '@>', JSON.stringify({ storageKey }) as never)
          .executeTakeFirstOrThrow()
      ).count,
    )

  it('commits both modules together', async () => {
    await db.transaction().execute(async (trx) => {
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

  // If either module ignored the `trx` it is handed and reached for the module-level
  // `db`, its write would land on a separate connection and outlive the
  // rollback — leaving, in the real shop-order path, an invoicing event for an order
  // that never existed.
  it('rolls both modules back when the transaction fails', async () => {
    await expect(
      db.transaction().execute(async (trx) => {
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
