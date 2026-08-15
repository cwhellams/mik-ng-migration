import { jest } from '@jest/globals'

import { getNextCreditNoteSequenceNumber } from '../../src/db/outbox-simplbooks-queries.ts'

describe('Outbox Simplbooks queries', () => {
  it('getNextCreditNoteSequenceNumber should return sequence number as string', async () => {
    const executeTakeFirstOrThrow = jest
      // camelDb's plugin camelCases result keys, so this is the shape the real
      // executor now returns
      .fn<() => Promise<{ nextSequenceNumber: bigint | number }>>()
      .mockResolvedValueOnce({ nextSequenceNumber: 12345 })
      .mockResolvedValueOnce({ nextSequenceNumber: BigInt(12346) })

    const selectNoFrom = jest.fn().mockReturnValue({
      executeTakeFirstOrThrow,
    })

    const txn = {
      selectNoFrom,
    } as any

    const first = await getNextCreditNoteSequenceNumber(txn)
    const second = await getNextCreditNoteSequenceNumber(txn)

    expect(first).toBe('12345')
    expect(second).toBe('12346')
    expect(BigInt(second)).toBeGreaterThan(BigInt(first))
  })
})
