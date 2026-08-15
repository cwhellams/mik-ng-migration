import { camelDb } from './connection.ts'
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
  memberId: string
  endpoint: string
  keysAuth: string
  keysP256dh: string
  userAgent: string | null
  createdAt: Date | string
}): PushSubscriptionRow => ({
  id: r.id,
  memberId: r.memberId,
  endpoint: r.endpoint,
  keysAuth: r.keysAuth,
  keysP256dh: r.keysP256dh,
  userAgent: r.userAgent,
  createdAt: new Date(r.createdAt).toISOString(),
})

export async function getPushSubscriptionsByMemberId(
  memberId: string,
): Promise<PushSubscriptionRow[]> {
  const rows = await camelDb
    .selectFrom('member.pushSubscriptions')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('createdAt', 'desc')
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
  const result = await camelDb
    .insertInto('member.pushSubscriptions')
    .values({
      memberId: input.memberId,
      endpoint: input.endpoint,
      keysAuth: input.keysAuth,
      keysP256dh: input.keysP256dh,
      userAgent: input.userAgent,
    })
    .onConflict((oc) =>
      oc.column('endpoint').doUpdateSet({
        memberId: input.memberId,
        keysAuth: input.keysAuth,
        keysP256dh: input.keysP256dh,
        userAgent: input.userAgent,
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
  const result = await camelDb
    .deleteFrom('member.pushSubscriptions')
    .where('memberId', '=', memberId)
    .where('endpoint', '=', endpoint)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

/** Remove a subscription by endpoint regardless of owner (e.g. push provider reports it as gone). */
export async function deletePushSubscriptionByEndpointGlobal(endpoint: string): Promise<void> {
  await camelDb.deleteFrom('member.pushSubscriptions').where('endpoint', '=', endpoint).execute()
}

/** Remove all subscriptions for a member (used when the member is deactivated). */
export async function deletePushSubscriptionsForMember(memberId: string): Promise<void> {
  await camelDb.deleteFrom('member.pushSubscriptions').where('memberId', '=', memberId).execute()
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

  const candidates = await camelDb
    .selectFrom('schedule.bookings')
    .select(['bookingId', 'memberId', 'registration', 'startTimeEpoch'])
    .where('startTimeEpoch', '>=', windowStart)
    .where('startTimeEpoch', '<=', windowEnd)
    .where((eb) =>
      eb.or([
        eb('bookingStatus', '=', BookingStatus.CONFIRMED),
        eb('bookingStatus', '=', BookingStatus.TENTATIVE),
      ]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('schedule.pushReminderLog')
            .select('id')
            .whereRef('schedule.pushReminderLog.bookingId', '=', 'schedule.bookings.bookingId'),
        ),
      ),
    )
    .execute()

  if (candidates.length === 0) {
    return []
  }

  const claimed = await camelDb
    .insertInto('schedule.pushReminderLog')
    .values(candidates.map((c) => ({ bookingId: c.bookingId, memberId: c.memberId })))
    .onConflict((oc) => oc.column('bookingId').doNothing())
    .returning('bookingId')
    .execute()

  const claimedIds = new Set(claimed.map((r) => r.bookingId))
  return candidates
    .filter((c) => claimedIds.has(c.bookingId))
    .map((c) => ({
      bookingId: c.bookingId,
      memberId: c.memberId,
      registration: c.registration,
      startTimeEpoch: c.startTimeEpoch,
    }))
}
