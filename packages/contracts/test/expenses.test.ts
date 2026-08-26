import { describe, expect, it } from 'vitest'

import { CreateExpenseClaimSchema, UpdateExpenseClaimSchema } from '../src/expenses.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const aClaim = (liquidRecordIds?: string[]) => ({
  categoryId: 1,
  title: 'Fuel claim',
  lineItems: [],
  ...(liquidRecordIds ? { liquidRecordIds } : {}),
})

/**
 * `liquidRecordIds` is a **set** of fuellings, not a list (#1119).
 *
 * It matters because the backend consumes the ids twice — once to derive the
 * claim's line items, once to link the records — and only the second collapses
 * duplicates by itself. A doubled id reaching the derivation would put the same
 * fuelling on the claim twice and double what the club reimburses, while the
 * link quietly attached one record.
 */
describe('a claim built from liquid records', () => {
  it('keeps one entry per record when the same one is picked twice', () => {
    const parsed = CreateExpenseClaimSchema.parse(aClaim([A, B, A]))

    expect(parsed.liquidRecordIds).toEqual([A, B])
  })

  it('deduplicates on a partial update too, which is where the picker re-sends', () => {
    // The wizard PUTs its whole selection back on every save, so this path sees
    // the ids as often as create does.
    const parsed = UpdateExpenseClaimSchema.parse({ liquidRecordIds: [B, A, B, B] })

    expect(parsed.liquidRecordIds).toEqual([B, A])
  })

  it('keeps an explicitly empty selection, rather than dropping the field', () => {
    // The distinction the route depends on: an empty array means the member
    // removed the last record and the claim's fuel details must go with it,
    // where an absent field means the claim is not record-backed at all.
    expect(UpdateExpenseClaimSchema.parse({ liquidRecordIds: [] })).toHaveProperty(
      'liquidRecordIds',
      [],
    )
    expect(UpdateExpenseClaimSchema.parse({ title: 'No records here' })).not.toHaveProperty(
      'liquidRecordIds',
    )
  })

  it('counts the ids as sent against the cap, before deduplicating', () => {
    // Otherwise 60 copies of one id would be a way past a limit that exists to
    // bound how many records one request may load.
    expect(() => CreateExpenseClaimSchema.parse(aClaim(Array(51).fill(A)))).toThrow()
  })

  it('rejects an id that is not a record id', () => {
    expect(() => CreateExpenseClaimSchema.parse(aClaim(['not-a-guid']))).toThrow()
  })
})
