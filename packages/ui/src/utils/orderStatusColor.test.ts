import type { OrderStatus } from '@mik/contracts/shop'
import { describe, expect, it } from 'vitest'

import { ORDER_STATUS_COLOR } from './orderStatusColor'

describe('ORDER_STATUS_COLOR', () => {
  it('maps every order status to a chip colour', () => {
    expect(ORDER_STATUS_COLOR).toEqual({
      PENDING: 'info',
      PROCESSING: 'warning',
      INVOICED: 'success',
      INVOICE_PAID: 'success',
      CANCELLED: 'error',
      REFUNDED: 'default',
    })
  })

  it('treats both invoiced states as success and only cancellation as an error', () => {
    const statuses: OrderStatus[] = ['INVOICED', 'INVOICE_PAID']

    expect(statuses.map((status) => ORDER_STATUS_COLOR[status])).toEqual(['success', 'success'])
    expect(ORDER_STATUS_COLOR.CANCELLED).toBe('error')
    expect(ORDER_STATUS_COLOR.REFUNDED).toBe('default')
  })
})
