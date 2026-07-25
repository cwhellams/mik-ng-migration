/**
 * Sends a real web push notification to a member's subscribed device(s), so
 * the push notification feature can be verified end-to-end in a browser
 * without waiting for the hourly worker or a real booking.
 *
 * Usage:
 *   npx tsx scripts/testPushNotification.ts <memberId>
 *
 * Reads VAPID_* config from apps/backend/.env (loaded automatically via
 * dotenv/config). The member must have already enabled push notifications
 * on their profile (member.push_subscriptions must have at least one row).
 */
import 'dotenv/config'
import { getPushSubscriptionsByMemberId } from '../src/db/push-queries.ts'
import { sendWebPush } from '../src/lib/webPush.ts'

const memberId = process.argv[2]
if (!memberId) {
  console.error('Usage: npx tsx scripts/testPushNotification.ts <memberId>')
  process.exit(1)
}

const subscriptions = await getPushSubscriptionsByMemberId(memberId)
if (subscriptions.length === 0) {
  console.error(
    `No push subscriptions found for member ${memberId}. Enable push notifications on their profile first.`,
  )
  process.exit(1)
}

console.log(
  `Sending test push to ${subscriptions.length} subscription(s) for member ${memberId}...`,
)

for (const subscription of subscriptions) {
  const result = await sendWebPush(subscription, {
    title: 'Test notification',
    body: 'If you can see this, push notifications are working.',
    url: '/schedule',
  })
  console.log(
    subscription.endpoint,
    '->',
    result.ok ? 'sent' : `failed: ${JSON.stringify(result.error)}`,
  )
}

process.exit(0)
