import type { OrderStatus } from '@backend/routes/shop/models'

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
