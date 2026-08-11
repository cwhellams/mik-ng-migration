/**
 * Fixtures shared by the reminder send-loop suites
 * (`bookingReminderWorker.sendLoop.test.ts`, `pushNotificationWorker.sendLoop.test.ts`).
 *
 * Both workers claim the same upcoming bookings and look the same members up;
 * each suite used to carry its own near-identical `booking()`/`member()` and
 * they had already drifted apart (one grew `endTimeEpoch`, the other lost
 * `lastName`). One definition here so a change to either worker's expected
 * shape can't quietly leave the other suite testing a stale one.
 *
 * The `as never` casts are deliberate: these stand in for rows returned by
 * module-mocked queries, and spelling out the full generated row types would
 * bury what each test is actually varying. Add fields here rather than
 * re-declaring a factory in a suite.
 */

import { MIKLang } from '../../src/routes/members/models.ts'

export const booking = (overrides: Record<string, unknown> = {}) =>
  ({
    bookingId: 'booking-1',
    memberId: 'Matti1',
    registration: 'OH-STL',
    startTimeEpoch: '1700000000',
    endTimeEpoch: '1700003600',
    ...overrides,
  }) as never

export const member = (overrides: Record<string, unknown> = {}) =>
  ({
    memberId: 'Matti1',
    firstName: 'Matti',
    lastName: 'Meikalainen',
    email: 'matti@example.com',
    lang: MIKLang.FI,
    ...overrides,
  }) as never

export const subscription = (endpoint: string) => ({ endpoint }) as never
