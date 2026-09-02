import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { getMembershipFees, getEquipmentFee } from '../../src/db/prices-queries.ts'
import {
  ART_EQUIP_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
} from '../../src/services/accounting/config.ts'

// Only Date needs to be fake here — the query functions read `new Date()` via
// feeDiscounts.ts. Faking timers wholesale (the jest default) also fakes
// setTimeout/setImmediate, which the real pg connection pool used by these
// integration tests relies on internally and then hangs forever.
const FAKE_TIMER_EXCLUSIONS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'hrtime',
  'performance',
  'queueMicrotask',
  'nextTick',
] as const

function setSystemDate(date: string) {
  jest.useFakeTimers({ doNotFake: [...FAKE_TIMER_EXCLUSIONS] }).setSystemTime(new Date(date))
}

describe('Prices Queries', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getMembershipFees', () => {
    it('leaves seasonalDiscountPercent unset before October 1', async () => {
      setSystemDate('2025-09-30T12:00:00Z')

      const fees = await getMembershipFees()
      const codes = fees.map((fee) => fee.code)

      // Assert presence rather than an exact set/count: other suites' fixtures
      // (e.g. the SimplBooks sync mock) leave extra rows sharing these codes in
      // the shared accts.items table, which isn't this query's concern to dedupe.
      expect(codes).toEqual(
        expect.arrayContaining([
          ART_MEMBER_FEE_CODE,
          ART_JUNIOR_MEMBER_FEE_CODE,
          ART_SUPPORTING_MEMBER_FEE_CODE,
        ]),
      )
      fees.forEach((fee) => {
        expect(fee.seasonalDiscountPercent).toBeUndefined()
      })
    })

    it('sets seasonalDiscountPercent to 50 on/after October 1', async () => {
      setSystemDate('2025-10-01T00:00:00Z')

      const fees = await getMembershipFees()

      expect(fees.length).toBeGreaterThan(0)
      fees.forEach((fee) => {
        expect(fee.seasonalDiscountPercent).toBe(50)
      })
    })
  })

  describe('getEquipmentFee', () => {
    it('leaves seasonalDiscountPercent unset before September 1', async () => {
      setSystemDate('2025-08-31T12:00:00Z')

      const fee = await getEquipmentFee()

      expect(fee).not.toBeNull()
      expect(fee?.code).toBe(ART_EQUIP_FEE_CODE)
      expect(fee?.seasonalDiscountPercent).toBeUndefined()
    })

    it('sets seasonalDiscountPercent to 50 on/after September 1', async () => {
      setSystemDate('2025-09-01T00:00:00Z')

      const fee = await getEquipmentFee()

      expect(fee).not.toBeNull()
      expect(fee?.seasonalDiscountPercent).toBe(50)
    })
  })
})
