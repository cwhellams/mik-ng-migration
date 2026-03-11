import { jest } from '@jest/globals'

import { getNextCreditNoteSequenceNumber } from '../../src/db/outbox-simplbooks-queries.ts'

describe('Outbox Simplbooks queries', () => {
  it('getNextCreditNoteSequenceNumber should return sequence number as string', async () => {
    const executeTakeFirstOrThrow = jest
      .fn<() => Promise<{ next_sequence_number: bigint | number }>>()
      .mockResolvedValueOnce({ next_sequence_number: 12345 })
      .mockResolvedValueOnce({ next_sequence_number: BigInt(12346) })

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
