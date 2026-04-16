import { jest, describe, it, expect } from '@jest/globals'

import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'

process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret'
process.env.ACCESS_TOKEN_EXPIRATION ??= '15m'

jest.mock('../../../src/db/shop-queries.ts', () => ({
  getCategories: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getCategoryById: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  insertCategory: jest.fn<() => Promise<unknown>>().mockResolvedValue({ categoryId: 'CAT001' }),
  updateCategory: jest.fn<() => Promise<unknown>>().mockResolvedValue({ categoryId: 'CAT001' }),
  deleteCategory: jest.fn<() => Promise<void>>().mockResolvedValue(),

  getProducts: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getProductById: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  insertProduct: jest.fn<() => Promise<unknown>>().mockResolvedValue({ productId: 'PROD001' }),
  updateProduct: jest.fn<() => Promise<unknown>>().mockResolvedValue({ productId: 'PROD001' }),
  deleteProduct: jest.fn<() => Promise<void>>().mockResolvedValue(),
  hasProductOrders: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),

  getProductProperties: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  upsertProductProperty: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  deleteProductProperty: jest.fn<() => Promise<void>>().mockResolvedValue(),

  getDiscountCodes: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getDiscountCodeByCode: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  insertDiscountCode: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  updateDiscountCode: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),

  getCart: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  addCartItem: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  updateCartItem: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  removeCartItem: jest.fn<() => Promise<void>>().mockResolvedValue(),
  clearCart: jest.fn<() => Promise<void>>().mockResolvedValue(),
  applyDiscountToCart: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),

  getOrders: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getOrderById: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  createOrderFromCart: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  updateOrderStatus: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
}))

const { router } = await import('../../../src/routes/shop/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/shop', router)
app.use(problemErrorHandler)

const storeAdminToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Whellams',
  email: 'test@example.com',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.STORE_ADMIN],
  canMakeReservations: false,
})

const storeUserToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: [],
  permissions: [MIKPermissions.STORE_USER],
  canMakeReservations: false,
})

const invoicingAdminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.INVOICING_ADMIN],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Matti2',
  lastName: 'Korhonen',
  email: 'member2@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

const validCategoryBody = {
  name: { en: 'Category EN', fi: 'Kategoria FI', sv: 'Kategori SV' },
  description: { en: 'Desc EN', fi: 'Desc FI', sv: 'Desc SV' },
  isActive: true,
  sortOrder: 1,
}

describe('POST /shop/categories', () => {
  it('should return 201 for store admin (regression: was returning 403 at router middleware)', async () => {
    const res = await request(app)
      .post('/shop/categories')
      .set('Cookie', `accessToken=${storeAdminToken}`)
      .send(validCategoryBody)

    expect(res.status).toBe(201)
  })

  it('should return 403 for store user', async () => {
    const res = await request(app)
      .post('/shop/categories')
      .set('Cookie', `accessToken=${storeUserToken}`)
      .send(validCategoryBody)

    expect(res.status).toBe(403)
  })

  it('should return 403 for plain member', async () => {
    const res = await request(app)
      .post('/shop/categories')
      .set('Cookie', `accessToken=${memberToken}`)
      .send(validCategoryBody)

    expect(res.status).toBe(403)
  })

  it('should return 403 for invoicing admin (not a store admin route)', async () => {
    const res = await request(app)
      .post('/shop/categories')
      .set('Cookie', `accessToken=${invoicingAdminToken}`)
      .send(validCategoryBody)

    expect(res.status).toBe(403)
  })
})

describe('GET /shop/categories', () => {
  it('should return 200 for store admin', async () => {
    const res = await request(app)
      .get('/shop/categories')
      .set('Cookie', `accessToken=${storeAdminToken}`)

    expect(res.status).toBe(200)
  })

  it('should return 200 for store user', async () => {
    const res = await request(app)
      .get('/shop/categories')
      .set('Cookie', `accessToken=${storeUserToken}`)

    expect(res.status).toBe(200)
  })

  it('should return 200 for invoicing admin', async () => {
    const res = await request(app)
      .get('/shop/categories')
      .set('Cookie', `accessToken=${invoicingAdminToken}`)

    expect(res.status).toBe(200)
  })

  it('should return 403 for plain member', async () => {
    const res = await request(app)
      .get('/shop/categories')
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(403)
  })

  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app).get('/shop/categories')

    expect(res.status).toBe(401)
  })
})
