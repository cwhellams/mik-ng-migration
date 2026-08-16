import 'dotenv/config'

import { jest } from '@jest/globals'

// MIK_SIMPLBOOKS_MEMBER is re-exported from here and needed elsewhere in the worker's
// import graph, so the mock has to provide it too.
jest.unstable_mockModule('../../src/services/simplbooks/simplbooksOutboxHandler.ts', () => ({
  dispatchOutboxMsg: jest.fn<(msg: unknown) => Promise<void>>(),
  MIK_SIMPLBOOKS_MEMBER: 'simplbks',
}))

const { dispatchOutboxMsg } =
  await import('../../src/services/simplbooks/simplbooksOutboxHandler.ts')
const { processOutbox } = await import('../../src/workers/simplbooksOutboxWorker.ts')

const { db } = await import('../../src/db/connection.ts')
const { SimplbooksEventType, SimplbooksStatus } =
  await import('../../src/services/simplbooks/models.ts')
const { insertOutboxItem } = await import('../../src/db/outbox-simplbooks-queries.ts')

const mockDispatch = jest.mocked(dispatchOutboxMsg)

/**
 * The worker reads a row of `accts.outbox_simplbooks` and hands it to
 * `dispatchOutboxMsg`, which switches on the event type. Nothing covered that handover:
 * the handler tests build their own row objects and call `dispatchOutboxMsg` directly,
 * so the worker's own query was never executed by a test.
 *
 * That gap let the row and the schema describing it drift apart. The query moved to the
 * camelCase instance while `AcctsOutboxSimplbooksSchema` stayed snake_case, and an
 * `as AcctsOutboxSimplbooks` cast in the worker hid it from the compiler — so
 * `taskRow.event_type` was `undefined`, every dispatch fell through to `default:`, and
 * every outbox item failed with "Unsupported outbox event type: undefined". Member fee
 * invoices, flight invoices, shop-order invoices and credit notes all go through here.
 *
 * These assertions are about the shape handed over, not about invoicing.
 */
describe('Simplbooks Outbox Worker', () => {
  const insertedIds: string[] = []
  let parkedIds: string[] = []

  beforeEach(async () => {
    jest.clearAllMocks()
    mockDispatch.mockResolvedValue(undefined)

    // processOutbox takes the *oldest* pending row, so any pending row already in the
    // database — seed data, or one left by an earlier suite in the same run — wins over
    // the one seeded here. Park them for the duration and restore them afterwards.
    parkedIds = (
      await db
        .selectFrom('accts.outboxSimplbooks')
        .select('id')
        .where('status', '=', SimplbooksStatus.PENDING)
        .execute()
    ).map((r) => r.id)

    if (parkedIds.length) {
      await db
        .updateTable('accts.outboxSimplbooks')
        .set({ status: SimplbooksStatus.SKIPPED })
        .where('id', 'in', parkedIds)
        .execute()
    }
  })

  afterEach(async () => {
    if (insertedIds.length) {
      await db
        .deleteFrom('accts.outboxSimplbooks')
        .where('id', 'in', insertedIds.splice(0))
        .execute()
    }
    if (parkedIds.length) {
      await db
        .updateTable('accts.outboxSimplbooks')
        .set({ status: SimplbooksStatus.PENDING })
        .where('id', 'in', parkedIds)
        .execute()
      parkedIds = []
    }
  })

  const seedPendingItem = async () => {
    await insertOutboxItem(SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE, { probe: true })
    const row = await db
      .selectFrom('accts.outboxSimplbooks')
      .select(['id'])
      .where('eventType', '=', SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE)
      .where('status', '=', SimplbooksStatus.PENDING)
      .orderBy('createdAtUtc', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()
    insertedIds.push(row.id)
    return row.id
  }

  it('hands the handler a row whose event type is actually populated', async () => {
    const id = await seedPendingItem()

    await processOutbox()

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    const msg = mockDispatch.mock.calls[0][0] as Record<string, unknown>

    // The bug this pins: eventType read as undefined, so the handler's switch fell
    // through to "Unsupported outbox event type: undefined".
    expect(msg.eventType).toBe(SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE)
    expect(msg.id).toBe(id)

    // createdAtUtc was undefined for the same reason, and three of the invoice builders
    // use it as the bookkeeping date — silently falling back to "now".
    expect(msg.createdAtUtc).toBeInstanceOf(Date)

    // No snake_case key should survive on a row read through the db instance.
    expect(Object.keys(msg).filter((k) => k.includes('_'))).toEqual([])
  })

  it('marks the row PROCESSING before dispatching it', async () => {
    const id = await seedPendingItem()

    let statusDuringDispatch: string | undefined
    mockDispatch.mockImplementation(async () => {
      const row = await db
        .selectFrom('accts.outboxSimplbooks')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
      statusDuringDispatch = row.status
    })

    await processOutbox()

    expect(statusDuringDispatch).toBe(SimplbooksStatus.PROCESSING)
  })

  it('records the error on the row when the handler throws', async () => {
    const id = await seedPendingItem()
    mockDispatch.mockRejectedValue(new Error('boom'))

    await processOutbox()

    const row = await db
      .selectFrom('accts.outboxSimplbooks')
      .select(['status', 'errorMessage'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()

    expect(row.status).toBe(SimplbooksStatus.FAILED)
    expect(row.errorMessage).toBe('boom')
  })

  it('does nothing and backs off when there is no pending row', async () => {
    const delay = await processOutbox()

    expect(mockDispatch).not.toHaveBeenCalled()
    expect(delay).toBe(30_000)
  })
})
