import 'dotenv/config'
import { toHelsinki } from '@mik/contracts/date'
import type { Order, OrderItem } from '@mik/contracts/shop'
import { localisedText } from '../lib/localisedText.ts'
import { buildItemsTableHtml, type ItemsTableRow } from './itemsTableHtml.ts'
import type { EmailLang, EmailTemplateVars } from './registry.ts'
import { normaliseEmailLang } from './renderEmail.ts'

// Everything the two shop order emails render: the notification to the shop
// inbox and the confirmation to the member who ordered. See
// ./bookingEmailHelpers.ts for the equivalent booking table.

const publicUrl = () => process.env.PUBLIC_URL ?? 'http://localhost:5173'

/**
 * What to call an ordered item.
 *
 * Read from the item's `productSnapshot` — what the member actually bought —
 * rather than from a live join on `shop.products`, so a later rename or a
 * deleted product cannot change or blank out a past order's email. Falls back
 * to `Product #<id>` exactly as the admin order page does
 * (`apps/admin/src/sections/shop/OrderDetailAdmin.tsx`), so the mail and the
 * screen never disagree about an item with no usable name.
 */
export const orderItemName = (item: OrderItem, lang: EmailLang): string =>
  localisedText(item.productSnapshot?.name, lang) || `Product #${item.productId}`

/** Order lines as the shared items table wants them. */
export const orderItemsTableRows = (order: Order, lang: EmailLang): ItemsTableRow[] =>
  (order.items ?? []).map((item) => ({
    name: orderItemName(item, lang),
    qty: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.totalPrice,
  }))

/** The values both shop order templates draw on. */
const shopOrderBaseVars = (order: Order, lang: EmailLang) => ({
  orderId: order.orderId,
  orderedAt: toHelsinki(order.createdAt).format('DD.MM.YYYY HH:mm'),
  itemsTableHtml: buildItemsTableHtml(orderItemsTableRows(order, lang), lang),
  totalAmount: order.totalAmount.toFixed(2),
  notes: order.notes ?? '',
})

/**
 * Vars for the notification sent to the shop inbox.
 *
 * Always English: the recipient is a shared club mailbox, not a member, and
 * #1248 settled on English for it (the aircraft-document mails to
 * `kalusto@mik.fi` are the existing precedent).
 *
 * `fallbackEmail` covers an order whose member row didn't come back from the
 * left join in `getOrderById` — the address of whoever placed the order is
 * still better than an empty pair of brackets.
 */
export const shopOrderNotificationVars = (
  order: Order,
  fallbackEmail?: string,
): EmailTemplateVars['shop-order-notification'] => ({
  ...shopOrderBaseVars(order, 'en'),
  memberName: order.member ? `${order.member.firstName} ${order.member.lastName}` : '',
  memberEmail: order.member?.email ?? fallbackEmail ?? '',
  // The admin app is a separate subdomain, so this points at the member app's
  // old `/admin/*` path and lets `AdminAppRedirect` forward it — the same hop
  // `ameSubmissionNotification.ts` relies on.
  href: `${publicUrl()}/admin/shop/orders/${order.orderId}`,
})

/** Vars for the confirmation sent to the member who placed the order. */
export const shopOrderConfirmationVars = (
  order: Order,
  firstName: string,
  lang: string | undefined,
): EmailTemplateVars['shop-order-confirmation'] => ({
  ...shopOrderBaseVars(order, normaliseEmailLang(lang)),
  firstName,
  href: `${publicUrl()}/shop/orders/${order.orderId}`,
})
