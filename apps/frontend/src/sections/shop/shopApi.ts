import type {
  Category,
  Product,
  Cart,
  CartItemUpsert,
  Order,
  OrderCreate,
  DiscountCode,
  ProductFilters,
  ProductProperty,
  PropertyUpsert,
} from '@backend/routes/shop/models'
import type { PrepaidPackage, MemberPackage } from '@backend/routes/prepaid-hours/models'
import type { AircraftListResponse } from '@backend/routes/aircrafts/models'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

const api = axios.create({
  baseURL: `${API_BASE}/api/v1/shop/`,
  withCredentials: true,
})

const prepaidApi = axios.create({
  baseURL: `${API_BASE}/api/v1/prepaid-hours/`,
  withCredentials: true,
})

const aircraftApi = axios.create({
  baseURL: `${API_BASE}/api/v1/aircrafts/`,
  withCredentials: true,
})

// ── Categories ────────────────────────────────────────────────────────────────
export const getCategories = (): Promise<Category[]> =>
  api.get<Category[]>('categories').then((r) => r.data)

export const createCategory = (data: Partial<Category>): Promise<Category> =>
  api.post<Category>('categories', data).then((r) => r.data)

export const updateCategory = (id: string, data: Partial<Category>): Promise<Category> =>
  api.put<Category>(`categories/${id}`, data).then((r) => r.data)

export const deleteCategory = (id: string): Promise<void> => api.delete(`categories/${id}`)

// ── Products ──────────────────────────────────────────────────────────────────
export const getProducts = (filters?: ProductFilters): Promise<Product[]> =>
  api.get<Product[]>('products', { params: filters }).then((r) => r.data)

export const getProduct = (id: string): Promise<Product> =>
  api.get<Product>(`products/${id}`).then((r) => r.data)

export const createProduct = (data: Partial<Product>): Promise<Product> =>
  api.post<Product>('products', data).then((r) => r.data)

export const updateProduct = (id: string, data: Partial<Product>): Promise<Product> =>
  api.put<Product>(`products/${id}`, data).then((r) => r.data)

export const deleteProduct = (id: string): Promise<void> => api.delete(`products/${id}`)

// ── Product properties ────────────────────────────────────────────────────────
export const getProductProperties = (productId: string): Promise<ProductProperty[]> =>
  api.get<ProductProperty[]>(`products/${productId}/properties`).then((r) => r.data)

export const upsertProductProperty = (
  productId: string,
  data: PropertyUpsert,
): Promise<ProductProperty[]> =>
  api.put<ProductProperty[]>(`products/${productId}/properties`, data).then((r) => r.data)

export const deleteProductProperty = (productId: string, propertyId: number): Promise<void> =>
  api.delete(`products/${productId}/properties/${propertyId}`)

// ── Cart ──────────────────────────────────────────────────────────────────────
export const getCart = (): Promise<Cart> => api.get<Cart>('cart').then((r) => r.data)

export const addToCart = (data: CartItemUpsert): Promise<Cart> =>
  api.post<Cart>('cart/items', data).then((r) => r.data)

export const updateCartItem = (itemId: number, quantity: number): Promise<Cart> =>
  api.put<Cart>(`cart/items/${itemId}`, { quantity }).then((r) => r.data)

export const removeFromCart = (itemId: number): Promise<Cart> =>
  api.delete<Cart>(`cart/items/${itemId}`).then((r) => r.data)

export const clearCart = (): Promise<Cart> => api.delete<Cart>('cart').then((r) => r.data)

export const applyDiscount = (code: string | null): Promise<Cart> =>
  api.post<Cart>('cart/discount', { code }).then((r) => r.data)

export const validateDiscount = (code: string): Promise<DiscountCode> =>
  api.get<DiscountCode>(`discount-codes/validate/${code}`).then((r) => r.data)

// ── Discount codes (admin) ────────────────────────────────────────────────────
export const getDiscountCodes = (): Promise<DiscountCode[]> =>
  api.get<DiscountCode[]>('discount-codes').then((r) => r.data)

export const createDiscountCode = (data: Partial<DiscountCode>): Promise<DiscountCode> =>
  api.post<DiscountCode>('discount-codes', data).then((r) => r.data)

export const updateDiscountCode = (
  id: number,
  data: Partial<DiscountCode>,
): Promise<DiscountCode> => api.put<DiscountCode>(`discount-codes/${id}`, data).then((r) => r.data)

// ── Orders ────────────────────────────────────────────────────────────────────
export const createOrder = (data: OrderCreate): Promise<Order> =>
  api.post<Order>('orders', data).then((r) => r.data)

export const getOrders = (params?: Record<string, string>): Promise<Order[]> =>
  api.get<Order[]>('orders', { params }).then((r) => r.data)

export const getOrder = (id: string): Promise<Order> =>
  api.get<Order>(`orders/${id}`).then((r) => r.data)

export const updateOrderStatus = (id: string, status: string): Promise<Order> =>
  api.put<Order>(`orders/${id}/status`, { status }).then((r) => r.data)

// ── Prepaid flight hours ──────────────────────────────────────────────────────
export const getPrepaidPackages = (aircraft?: string): Promise<PrepaidPackage[]> =>
  prepaidApi
    .get<PrepaidPackage[]>('packages', { params: aircraft ? { aircraft } : {} })
    .then((r) => r.data)

export const createPrepaidPackage = (data: Partial<PrepaidPackage>): Promise<PrepaidPackage> =>
  prepaidApi.post<PrepaidPackage>('packages', data).then((r) => r.data)

export const updatePrepaidPackage = (
  id: string,
  data: Partial<PrepaidPackage>,
): Promise<PrepaidPackage> =>
  prepaidApi.put<PrepaidPackage>(`packages/${id}`, data).then((r) => r.data)

export const getMemberPackages = (memberId?: string): Promise<MemberPackage[]> =>
  prepaidApi
    .get<MemberPackage[]>('member-packages', { params: memberId ? { memberId } : {} })
    .then((r) => r.data)

export const extendExpiry = (data: {
  aircraftRegistration: string
  daysToAdd: number
}): Promise<{ updated: number }> =>
  prepaidApi.post<{ updated: number }>('extend-expiry', data).then((r) => r.data)

// ── Aircraft ──────────────────────────────────────────────────────────────────
export const getActiveAircraft = (): Promise<AircraftListResponse> =>
  aircraftApi.get<AircraftListResponse>('', { params: { activeOnly: true } }).then((r) => r.data)
