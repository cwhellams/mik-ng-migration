/**
 * Cleanup for the suites that create `schedule.bookings` rows.
 *
 * Every delete here checks its own row count and fails when it doesn't match.
 * Seven suites had each grown a private `deleteFrom('schedule.bookings')` that
 * discarded its result, and #1306 is what that costs: the instructor
 * notification suite cleaned up through `DELETE /bookings/:id`, a route the
 * bookings router has never mounted. The 404 went into an ignored promise, so
 * every run left nine CONFIRMED future-dated OH-IHQ bookings behind, and the
 * next run's overlapping create auto-cancelled them and mailed the instructor a
 * cancellation where the assertion wanted an assignment. Cleanup that never
 * looks at its own result cannot fail loudly.
 */

import { afterEach } from '@jest/globals'
import { db } from '../../src/db/connection.ts'

/**
 * Deletes one booking, throwing unless exactly that row went.
 *
 * Call this from a `beforeAll` / `afterAll` / `afterEach` hook. From a `finally`
 * block use `installBookingCleanup()` instead — see why below.
 */
export const deleteBooking = async (bookingId: string) => {
  const { numDeletedRows } = await db
    .deleteFrom('schedule.bookings')
    .where('bookingId', '=', bookingId)
    .executeTakeFirst()
  if (numDeletedRows !== 1n) {
    throw new Error(
      `Cleanup failed to delete booking ${bookingId}: deleted ${numDeletedRows} rows, expected 1`,
    )
  }
}

/** Deletes several bookings, throwing unless every one of them was there. */
export const deleteBookings = async (bookingIds: readonly string[]) => {
  if (bookingIds.length === 0) return
  const { numDeletedRows } = await db
    .deleteFrom('schedule.bookings')
    .where('bookingId', 'in', bookingIds)
    .executeTakeFirst()
  if (numDeletedRows !== BigInt(bookingIds.length)) {
    throw new Error(
      `Cleanup failed to delete bookings ${bookingIds.join(', ')}: deleted ${numDeletedRows} rows, expected ${bookingIds.length}`,
    )
  }
}

/**
 * Returns a delete that is safe to call from a test's `finally` block, and
 * registers the `afterEach` that reports whatever it recorded.
 *
 * A `finally` that throws discards the error the `try` was already propagating —
 * JS keeps only the later one — so `deleted 0 rows, expected 1` would reach CI
 * *instead of* the assertion mismatch that is the actual finding. Recording the
 * failure and re-raising it from `afterEach` keeps both: Jest reports a hook
 * failure alongside the test's own, so the mismatch stays the headline and a
 * silent cleanup failure is still impossible.
 *
 * The hook is registered by this call rather than left to the caller, because
 * there is no other way to obtain the recording delete — so the re-raise cannot
 * be forgotten, which would put us back to cleanup that fails quietly.
 */
export const installBookingCleanup = () => {
  const failures: string[] = []

  afterEach(() => {
    const pending = failures.splice(0)
    if (pending.length > 0) {
      throw new Error(`Booking cleanup failed: ${pending.join('; ')}`)
    }
  })

  return async (bookingId: string) => {
    try {
      await deleteBooking(bookingId)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
}
