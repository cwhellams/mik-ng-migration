import type { Order } from '@mik/contracts/shop'
import logger from '../lib/logger.ts'
import type { sendEmail } from '../lib/sendGmail.ts'
import { renderEmail } from './renderEmail.ts'
import { shopOrderConfirmationVars, shopOrderNotificationVars } from './shopEmailHelpers.ts'

/**
 * The two emails a new shop order sends: one to the shop inbox, one to the
 * member who ordered.
 *
 * Kept out of `routes/shop/api.ts` for the same reason
 * `./occurrenceNotification.ts` is kept out of the occurrence route — the
 * sending is testable on its own, and `sendEmailFn` is injected so a test never
 * has to reach for the SMTP client.
 *
 * Everything both emails need comes off `order` itself: `getOrderById` already
 * left-joins `member.register` for the buyer's name, address and language. That
 * is deliberate rather than incidental — an earlier version fetched the member
 * with `getMemberById`, which meant one transient DB failure suppressed the
 * shop inbox notification too, even though that mail depends on nothing but the
 * order.
 *
 * Both sends are fire-and-forget. The order is already committed by the time
 * this runs, so a mail failure must never turn a successful purchase into an
 * error for the member.
 */
export const sendShopOrderEmails = (
  sendEmailFn: typeof sendEmail,
  order: Order,
  /** Address of whoever placed the order, used only if the order carries no member row. */
  orderedByEmail: string,
): void => {
  const notifyEmail = process.env.ORDER_NOTIFICATION_EMAIL
  if (notifyEmail) {
    const { subject, html } = renderEmail(
      'shop-order-notification',
      'en',
      shopOrderNotificationVars(order, orderedByEmail),
    )
    sendEmailFn(notifyEmail, subject, html).catch((err: unknown) =>
      logger.error('Failed to send order notification email', err),
    )
  }

  const member = order.member
  if (!member) {
    logger.warn(`No member ${order.memberId} for order ${order.orderId}; no confirmation sent`)
    return
  }

  const { subject, html } = renderEmail(
    'shop-order-confirmation',
    member.lang ?? undefined,
    shopOrderConfirmationVars(order, member.firstName, member.lang ?? undefined),
  )
  sendEmailFn(member.email, subject, html).catch((err: unknown) =>
    logger.error('Failed to send order confirmation email', err),
  )
}
