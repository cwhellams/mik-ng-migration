type ShopProductAvailability = {
  isPublished?: boolean
  isActive?: boolean
} | null

export const isAdminShopView = (isStoreAdmin: boolean, adminViewQueryParam: unknown): boolean =>
  isStoreAdmin && adminViewQueryParam === 'true'

export const isPurchasableProduct = (product: ShopProductAvailability): boolean =>
  product?.isPublished === true && product?.isActive === true
