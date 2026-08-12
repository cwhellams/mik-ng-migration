import type { OrderStatus } from '@mik/contracts/shop'

export const ORDER_STATUS_COLOR: Record<
  OrderStatus,
  'info' | 'warning' | 'success' | 'error' | 'default'
> = {
  PENDING: 'info',
  PROCESSING: 'warning',
  INVOICED: 'success',
  INVOICE_PAID: 'success',
  CANCELLED: 'error',
  REFUNDED: 'default',
}
