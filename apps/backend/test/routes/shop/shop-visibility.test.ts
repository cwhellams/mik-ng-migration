import { describe, expect, it } from '@jest/globals'
import { isAdminShopView, isPurchasableProduct } from '../../../src/routes/shop/shop-visibility.ts'

describe('shop visibility helpers', () => {
  describe('isAdminShopView', () => {
    it('returns true only when admin explicitly requests admin view', () => {
      expect(isAdminShopView(true, 'true')).toBe(true)
      expect(isAdminShopView(true, 'false')).toBe(false)
      expect(isAdminShopView(false, 'true')).toBe(false)
    })
  })

  describe('isPurchasableProduct', () => {
    it('returns true only for active and published products', () => {
      expect(isPurchasableProduct({ isActive: true, isPublished: true })).toBe(true)
      expect(isPurchasableProduct({ isActive: false, isPublished: true })).toBe(false)
      expect(isPurchasableProduct({ isActive: true, isPublished: false })).toBe(false)
      expect(isPurchasableProduct(null)).toBe(false)
    })
  })
})
