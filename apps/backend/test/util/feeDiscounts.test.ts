import {
  HALF_YEAR_DISCOUNT_PERCENT,
  isAfterEquipmentFeeDiscountDate,
  isAfterMembershipFeeDiscountDate,
} from '../../src/util/feeDiscounts.ts'

describe('feeDiscounts', () => {
  describe('HALF_YEAR_DISCOUNT_PERCENT', () => {
    it('is 50', () => {
      expect(HALF_YEAR_DISCOUNT_PERCENT).toBe(50)
    })
  })

  describe('isAfterEquipmentFeeDiscountDate (September 1 cutoff)', () => {
    it('returns false for dates before September', () => {
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-01-01T12:00:00Z'))).toBe(false)
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-06-15T12:00:00Z'))).toBe(false)
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-08-31T12:00:00Z'))).toBe(false)
    })

    it('returns true on September 1', () => {
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-09-01T12:00:00Z'))).toBe(true)
    })

    it('returns true for dates after September 1', () => {
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-09-15T12:00:00Z'))).toBe(true)
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-10-01T12:00:00Z'))).toBe(true)
      expect(isAfterEquipmentFeeDiscountDate(new Date('2025-12-31T12:00:00Z'))).toBe(true)
    })
  })

  describe('isAfterMembershipFeeDiscountDate (October 1 cutoff)', () => {
    it('returns false for dates before October', () => {
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-01-01T12:00:00Z'))).toBe(false)
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-08-01T12:00:00Z'))).toBe(false)
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-09-30T12:00:00Z'))).toBe(false)
    })

    it('returns true on October 1', () => {
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-10-01T12:00:00Z'))).toBe(true)
    })

    it('returns true for dates after October 1', () => {
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-10-15T12:00:00Z'))).toBe(true)
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-11-01T12:00:00Z'))).toBe(true)
      expect(isAfterMembershipFeeDiscountDate(new Date('2025-12-31T12:00:00Z'))).toBe(true)
    })
  })
})
