import { db } from './connection.ts'
import { BookingStatus } from '@mik/contracts/bookings'
import dayjs from 'dayjs'

export type PushSubscriptionRow = {
  id: string
  memberId: string
  endpoint: string
  keysAuth: string
  keysP256dh: string
  userAgent: string | null
  createdAt: string
}

const mapRow = (r: {
  id: string
  member_id: string
  endpoint: string
  keys_auth: string
  keys_p256dh: string
  user_agent: string | null
  created_at: Date | string
}): PushSubscriptionRow => ({
  id: r.id,
  memberId: r.member_id,
  endpoint: r.endpoint,
  keysAuth: r.keys_auth,
  keysP256dh: r.keys_p256dh,
  userAgent: r.user_agent,
  createdAt: new Date(r.created_at).toISOString(),
})

export async function getPushSubscriptionsByMemberId(
  memberId: string,
): Promise<PushSubscriptionRow[]> {
  const rows = await db
    .selectFrom('member.push_subscriptions')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()
  return rows.map(mapRow)
}

/**
 * Register (or re-register) a push subscription. The endpoint is unique per
 * browser/device, so re-subscribing (e.g. after the browser rotates the
 * subscription's keys) replaces the previous row for that endpoint rather
 * than creating a duplicate.
 */
export async function upsertPushSubscription(input: {
  memberId: string
  endpoint: string
  keysAuth: string
  keysP256dh: string
  userAgent: string | null
}): Promise<string> {
  const result = await db
    .insertInto('member.push_subscriptions')
    .values({
      member_id: input.memberId,
      endpoint: input.endpoint,
      keys_auth: input.keysAuth,
      keys_p256dh: input.keysP256dh,
      user_agent: input.userAgent,
    })
    .onConflict((oc) =>
      oc.column('endpoint').doUpdateSet({
        member_id: input.memberId,
        keys_auth: input.keysAuth,
        keys_p256dh: input.keysP256dh,
        user_agent: input.userAgent,
      }),
    )
    .returning('id')
    .executeTakeFirstOrThrow()
  return result.id
}

/** Delete a subscription owned by the given member. Returns true if a row was removed. */
export async function deletePushSubscriptionByEndpoint(
  memberId: string,
  endpoint: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom('member.push_subscriptions')
    .where('member_id', '=', memberId)
    .where('endpoint', '=', endpoint)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

/** Remove a subscription by endpoint regardless of owner (e.g. push provider reports it as gone). */
export async function deletePushSubscriptionByEndpointGlobal(endpoint: string): Promise<void> {
  await db.deleteFrom('member.push_subscriptions').where('endpoint', '=', endpoint).execute()
}

/** Remove all subscriptions for a member (used when the member is deactivated). */
export async function deletePushSubscriptionsForMember(memberId: string): Promise<void> {
  await db.deleteFrom('member.push_subscriptions').where('member_id', '=', memberId).execute()
}

export type PushReminderCandidate = {
  bookingId: string
  memberId: string
  registration: string
  startTimeEpoch: string
}

/**
 * Atomically claim upcoming bookings that need a push reminder.
 *
 * Unlike the email reminder (which claims by setting reminder_sent_at
 * directly on schedule.bookings), push reminders are tracked in a separate
 * schedule.push_reminder_log table with a UNIQUE(booking_id) constraint, so
 * concurrent worker instances race on INSERT ... ON CONFLICT DO NOTHING —
 * only one instance's INSERT wins per booking.
 *
 * Claims bookings with CONFIRMED or TENTATIVE status where start_time_epoch
 * is within a +/-1h window around `hoursBeforeBooking` hours from now (to
 * handle hourly cron timing variance) and no push reminder has been sent yet.
 * Only the pilot (member_id) is notified, not the instructor.
 */
export async function claimUpcomingBookingsForPushReminder(
  hoursBeforeBooking: number = 1,
): Promise<PushReminderCandidate[]> {
  const windowStart = dayjs()
    .add(hoursBeforeBooking - 1, 'hour')
    .unix()
    .toString()
  const windowEnd = dayjs()
    .add(hoursBeforeBooking + 1, 'hour')
    .unix()
    .toString()

  const candidates = await db
    .selectFrom('schedule.bookings')
    .select(['booking_id', 'member_id', 'registration', 'start_time_epoch'])
    .where('start_time_epoch', '>=', windowStart)
    .where('start_time_epoch', '<=', windowEnd)
    .where((eb) =>
      eb.or([
        eb('booking_status', '=', BookingStatus.CONFIRMED),
        eb('booking_status', '=', BookingStatus.TENTATIVE),
      ]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('schedule.push_reminder_log')
            .select('id')
            .whereRef('schedule.push_reminder_log.booking_id', '=', 'schedule.bookings.booking_id'),
        ),
      ),
    )
    .execute()

  if (candidates.length === 0) {
    return []
  }

  const claimed = await db
    .insertInto('schedule.push_reminder_log')
    .values(candidates.map((c) => ({ booking_id: c.booking_id, member_id: c.member_id })))
    .onConflict((oc) => oc.column('booking_id').doNothing())
    .returning('booking_id')
    .execute()

  const claimedIds = new Set(claimed.map((r) => r.booking_id))
  return candidates
    .filter((c) => claimedIds.has(c.booking_id))
    .map((c) => ({
      bookingId: c.booking_id,
      memberId: c.member_id,
      registration: c.registration,
      startTimeEpoch: c.start_time_epoch,
    }))
}
