/**
 * Tests for the two emails a new shop order sends: the notification to the
 * shop inbox and the confirmation to the member who ordered (#1248).
 *
 * Separate from api.test.ts because it needs jest.unstable_mockModule (the
 * ESM-native mock API) to intercept sendEmail before any module that imports
 * it resolves — the same reason bookings has an api-instructor-notification
 * test of its own.
 */

import { jest, describe, it, beforeEach, afterAll, expect } from '@jest/globals'

// dotenv must load before any module that reads env vars
import 'dotenv/config'

import type { Order } from '@mik/contracts/shop'
import type { sendEmail } from '../../../src/lib/sendGmail.ts'

const mockSendEmail = jest.fn<typeof sendEmail>()
jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

const mockCreateOrderFromCart = jest.fn<() => Promise<Order>>()
const shopQueryStub = () => jest.fn<(...args: unknown[]) => Promise<unknown>>()
jest.unstable_mockModule('../../../src/db/shop-queries.ts', () => ({
  getCategories: shopQueryStub(),
  getCategoryById: shopQueryStub(),
  insertCategory: shopQueryStub(),
  updateCategory: shopQueryStub(),
  deleteCategory: shopQueryStub(),
  getProducts: shopQueryStub(),
  getProductById: shopQueryStub(),
  insertProduct: shopQueryStub(),
  updateProduct: shopQueryStub(),
  deleteProduct: shopQueryStub(),
  hasProductOrders: shopQueryStub(),
  getProductProperties: shopQueryStub(),
  upsertProductProperty: shopQueryStub(),
  deleteProductProperty: shopQueryStub(),
  getDiscountCodes: shopQueryStub(),
  getDiscountCodeByCode: shopQueryStub(),
  insertDiscountCode: shopQueryStub(),
  updateDiscountCode: shopQueryStub(),
  getCart: jest.fn<() => Promise<unknown>>().mockResolvedValue({ items: [] }),
  addCartItem: shopQueryStub(),
  updateCartItem: shopQueryStub(),
  removeCartItem: shopQueryStub(),
  clearCart: shopQueryStub(),
  applyDiscountToCart: shopQueryStub(),
  getOrders: shopQueryStub(),
  getOrderById: shopQueryStub(),
  createOrderFromCart: mockCreateOrderFromCart,
  updateOrderStatus: shopQueryStub(),
}))

const { default: express } = await import('express')
const { default: cookieParser } = await import('cookie-parser')
const { default: request } = await import('supertest')

const { router } = await import('../../../src/routes/shop/api.ts')
const { generateAccessToken } = await import('../../../src/routes/auth/token.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { MIKPermissions, MIKLang } = await import('@mik/contracts/members')

process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret'
process.env.ACCESS_TOKEN_EXPIRATION ??= '15m'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/shop', router)
app.use(problemErrorHandler)

const storeUserToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'buyer@example.fi',
  roles: [],
  permissions: [MIKPermissions.STORE_USER],
  canMakeReservations: false,
})

const order: Order = {
  orderId: 'ORD00123',
  memberId: 'Matti1',
  status: 'PENDING',
  totalAmount: 50,
  discountCodeId: null,
  discountAmount: null,
  invoiceId: null,
  notes: null,
  createdAt: '2026-08-20T09:15:00.000Z',
  createdBy: 'Matti1',
  updatedAt: '2026-08-20T09:15:00.000Z',
  updatedBy: 'Matti1',
  // Everything both emails need — including `lang` — comes off the order's own
  // joined member row. `sendShopOrderEmails` makes no query of its own.
  member: {
    memberId: 'Matti1',
    firstName: 'Matti',
    lastName: 'Virtanen',
    email: 'matti@example.com',
    phoneNumber: null,
    lang: MIKLang.FI,
  },
  items: [
    {
      orderItemId: 1,
      orderId: 'ORD00123',
      productId: 'PROD001',
      quantity: 2,
      unitPrice: 25,
      totalPrice: 50,
      selectedOptions: null,
      productSnapshot: {
        name: { en: 'MIK cap, navy', fi: 'MIK-lippalakki, sininen', sv: 'MIK-keps, marinblå' },
        price: 25,
      },
    },
  ],
}

const originalNotifyEmail = process.env.ORDER_NOTIFICATION_EMAIL

const postOrder = () =>
  request(app).post('/shop/orders').set('Cookie', `accessToken=${storeUserToken}`).send({})

/** The mail sent to `to`, or undefined if none was. */
const mailTo = (to: string) => mockSendEmail.mock.calls.find((call) => call[0] === to)

beforeEach(() => {
  mockSendEmail.mockReset()
  mockSendEmail.mockResolvedValue(undefined as never)
  mockCreateOrderFromCart.mockReset()
  mockCreateOrderFromCart.mockResolvedValue(order)
  process.env.ORDER_NOTIFICATION_EMAIL = 'kauppa@mik.fi'
})

afterAll(() => {
  if (originalNotifyEmail === undefined) delete process.env.ORDER_NOTIFICATION_EMAIL
  else process.env.ORDER_NOTIFICATION_EMAIL = originalNotifyEmail
})

describe('POST /shop/orders order notification email', () => {
  it('names the product instead of its id (regression: #1248)', async () => {
    const res = await postOrder()

    expect(res.status).toBe(201)
    const html = mailTo('kauppa@mik.fi')![2]
    expect(html).toContain('MIK cap, navy')
    expect(html).not.toContain('PROD001')
  })

  it('renders through the shared MIK template, not hand-rolled HTML', async () => {
    await postOrder()

    const [, subject, html] = mailTo('kauppa@mik.fi')!
    expect(subject).toBe('New shop order #ORD00123')
    expect(html).toContain('alt="MIK Logo"')
    expect(html).toContain('Malmin Ilmailukerho ry')
    expect(html).toContain('Matti Virtanen')
  })

  it('is in English even for a Finnish-speaking member — it goes to a club inbox', async () => {
    await postOrder()

    expect(mailTo('kauppa@mik.fi')![2]).toContain('New shop order')
  })

  it('escapes the member’s own note rather than interpolating it raw', async () => {
    mockCreateOrderFromCart.mockResolvedValue({ ...order, notes: '<img src=x onerror=1>' })

    await postOrder()

    const html = mailTo('kauppa@mik.fi')![2]
    expect(html).not.toContain('<img src=x')
    // Handlebars escapes `<`, `>` and `=` — the raw tag never reaches the inbox
    expect(html).toContain('&lt;img src&#x3D;x onerror&#x3D;1&gt;')
  })

  it('is not sent when ORDER_NOTIFICATION_EMAIL is unset', async () => {
    delete process.env.ORDER_NOTIFICATION_EMAIL

    const res = await postOrder()

    expect(res.status).toBe(201)
    expect(mailTo('kauppa@mik.fi')).toBeUndefined()
    // The member still gets their confirmation
    expect(mailTo('matti@example.com')).toBeDefined()
  })
})

describe('POST /shop/orders confirmation email to the member', () => {
  it('is sent to the member in their own language', async () => {
    await postOrder()

    const [, subject, html] = mailTo('matti@example.com')!
    expect(subject).toBe('MIK verkkokauppa – tilausvahvistus #ORD00123')
    expect(html).toContain('Hei Matti')
    expect(html).toContain('MIK-lippalakki, sininen')
  })

  it('links the member to their own order page, not the admin one', async () => {
    await postOrder()

    const html = mailTo('matti@example.com')![2]
    expect(html).toContain('/shop/orders/ORD00123')
    expect(html).not.toContain('/admin/shop/orders/')
  })

  it('is skipped when the order carries no member row, without failing the order', async () => {
    mockCreateOrderFromCart.mockResolvedValue({ ...order, member: undefined })

    const res = await postOrder()

    expect(res.status).toBe(201)
    expect(mailTo('matti@example.com')).toBeUndefined()
    // The shop inbox is still told about the order, addressed from the token
    expect(mailTo('kauppa@mik.fi')![2]).toContain('buyer@example.fi')
  })

  it('falls back to English for a member with no language on their row', async () => {
    mockCreateOrderFromCart.mockResolvedValue({
      ...order,
      member: { ...order.member!, lang: null },
    })

    await postOrder()

    const [, subject, html] = mailTo('matti@example.com')!
    expect(subject).toBe('MIK shop – order confirmation #ORD00123')
    expect(html).toContain('MIK cap, navy')
  })
})

describe('POST /shop/orders when email fails', () => {
  it('still returns 201 when sending rejects', async () => {
    mockSendEmail.mockRejectedValue(new Error('SMTP down'))

    const res = await postOrder()

    expect(res.status).toBe(201)
    expect(res.body.orderId).toBe('ORD00123')
  })

  it('sends the shop inbox its notification before touching the member’s email', async () => {
    // The notification depends on nothing but the order, so it goes out first
    // and nothing the member's own confirmation needs can suppress it. An
    // earlier version fetched the member up front, which meant one transient DB
    // failure lost both mails (#1289 review).
    await postOrder()

    expect(mockSendEmail.mock.calls.map((call) => call[0])).toEqual([
      'kauppa@mik.fi',
      'matti@example.com',
    ])
  })
})
