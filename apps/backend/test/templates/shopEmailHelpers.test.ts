import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { MIKLang } from '@mik/contracts/members'
import type { Order, OrderItem } from '@mik/contracts/shop'
import {
  orderItemName,
  orderItemsTableRows,
  shopOrderConfirmationVars,
  shopOrderNotificationVars,
} from '../../src/templates/shopEmailHelpers.ts'

// #1248: the shop order notification printed `productId` where the product's
// name belongs. The name is in the order item's `productSnapshot`; these tests
// pin the resolution of it, including the cases where it is partly missing.

const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({
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
  ...overrides,
})

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    orderId: 'ORD00123',
    memberId: 'Matti1',
    status: 'PENDING',
    totalAmount: 87.5,
    discountCodeId: null,
    discountAmount: null,
    invoiceId: null,
    notes: null,
    createdAt: '2026-08-20T09:15:00.000Z',
    createdBy: 'Matti1',
    updatedAt: '2026-08-20T09:15:00.000Z',
    updatedBy: 'Matti1',
    member: {
      memberId: 'Matti1',
      firstName: 'Matti',
      lastName: 'Virtanen',
      email: 'matti@example.com',
      phoneNumber: null,
      lang: MIKLang.FI,
    },
    items: [item()],
    ...overrides,
  }) as Order

// The `{en, fi, sv}` resolution `orderItemName` leans on is shared with the
// SimplBooks invoice lines and tested in test/lib/localisedText.test.ts.
describe('orderItemName', () => {
  it('reads the name out of the product snapshot, not the product id', () => {
    expect(orderItemName(item(), MIKLang.EN)).toBe('MIK cap, navy')
    expect(orderItemName(item(), MIKLang.FI)).toBe('MIK-lippalakki, sininen')
  })

  it('falls back to Product #<id>, as the admin order page does', () => {
    expect(orderItemName(item({ productSnapshot: {} }), MIKLang.EN)).toBe('Product #PROD001')
  })

  it('falls back for a snapshot whose name is blank in every language', () => {
    const snapshot = { name: { en: '', fi: '', sv: '' } }

    expect(orderItemName(item({ productSnapshot: snapshot }), MIKLang.EN)).toBe('Product #PROD001')
  })
})

describe('orderItemsTableRows', () => {
  it('maps each order item to a table row', () => {
    expect(orderItemsTableRows(order(), MIKLang.EN)).toEqual([
      { name: 'MIK cap, navy', qty: 2, unitPrice: 25, lineTotal: 50 },
    ])
  })

  it('is empty for an order whose items were not loaded', () => {
    expect(orderItemsTableRows(order({ items: undefined }), MIKLang.EN)).toEqual([])
  })
})

describe('shop order email vars', () => {
  const originalPublicUrl = process.env.PUBLIC_URL

  beforeEach(() => {
    process.env.PUBLIC_URL = 'https://intra.example.fi'
  })

  afterEach(() => {
    if (originalPublicUrl === undefined) delete process.env.PUBLIC_URL
    else process.env.PUBLIC_URL = originalPublicUrl
  })

  describe('shopOrderNotificationVars', () => {
    it('names the member and formats the order in Helsinki time', () => {
      const vars = shopOrderNotificationVars(order())

      expect(vars.memberName).toBe('Matti Virtanen')
      expect(vars.memberEmail).toBe('matti@example.com')
      expect(vars.orderedAt).toBe('20.08.2026 12:15')
      expect(vars.totalAmount).toBe('87.50')
      expect(vars.notes).toBe('')
    })

    it('renders the items table with the product name in it', () => {
      expect(shopOrderNotificationVars(order()).itemsTableHtml).toContain('MIK cap, navy')
    })

    it('is always English, whatever the member speaks', () => {
      expect(shopOrderNotificationVars(order()).itemsTableHtml).toContain('Unit price')
    })

    it('leaves the items table undefined for an order with no items', () => {
      expect(shopOrderNotificationVars(order({ items: [] })).itemsTableHtml).toBeUndefined()
    })

    it('falls back to the ordering user’s address when the order has no member row', () => {
      const vars = shopOrderNotificationVars(order({ member: undefined }), 'buyer@example.fi')

      expect(vars.memberName).toBe('')
      expect(vars.memberEmail).toBe('buyer@example.fi')
    })

    it('links to the order in the admin app, via the member app’s redirect', () => {
      expect(shopOrderNotificationVars(order()).href).toBe(
        'https://intra.example.fi/admin/shop/orders/ORD00123',
      )
    })
  })

  describe('shopOrderConfirmationVars', () => {
    it('renders the items in the member’s own language', () => {
      const vars = shopOrderConfirmationVars(order(), 'Matti', MIKLang.FI)

      expect(vars.firstName).toBe('Matti')
      expect(vars.itemsTableHtml).toContain('MIK-lippalakki, sininen')
      expect(vars.itemsTableHtml).toContain('À-hinta')
    })

    it('falls back to English for a language we do not translate into', () => {
      expect(shopOrderConfirmationVars(order(), 'Matti', 'de').itemsTableHtml).toContain(
        'MIK cap, navy',
      )
    })

    it('links to the order in the member app', () => {
      expect(shopOrderConfirmationVars(order(), 'Matti', MIKLang.EN).href).toBe(
        'https://intra.example.fi/shop/orders/ORD00123',
      )
    })

    it('passes the member’s note through for the {{#if notes}} block', () => {
      expect(
        shopOrderConfirmationVars(order({ notes: 'Collect on Saturday' }), 'Matti', MIKLang.EN)
          .notes,
      ).toBe('Collect on Saturday')
    })
  })
})
