/**
 * Tests for the booking reminder send loop.
 *
 * Separate from bookingReminderWorker.test.ts because this file module-mocks
 * the DB queries with jest.unstable_mockModule, which cannot coexist with that
 * file's real-Postgres assertions. Same split as
 * api-instructor-notification.test.ts.
 *
 * The existing suite covers the claim query and the cron scheduling; this one
 * covers what happens in between, which is the part that decides who gets mail.
 */

import 'dotenv/config'
import { jest } from '@jest/globals'
import { MIKLang } from '../../src/routes/members/models.ts'
import { booking, member } from './sendLoopFixtures.ts'

jest.unstable_mockModule('../../src/db/booking-queries.ts', () => ({
  claimUpcomingBookingsForReminder: jest.fn(),
}))

jest.unstable_mockModule('../../src/db/member-queries.ts', () => ({
  getMemberById: jest.fn(),
}))

const { claimUpcomingBookingsForReminder } = await import('../../src/db/booking-queries.ts')
const { getMemberById } = await import('../../src/db/member-queries.ts')
const { sendBookingReminders } = await import('../../src/workers/bookingReminderWorker.ts')

const mockClaimBookings = claimUpcomingBookingsForReminder as jest.MockedFunction<
  typeof claimUpcomingBookingsForReminder
>
const mockGetMemberById = getMemberById as jest.MockedFunction<typeof getMemberById>

describe('sendBookingReminders', () => {
  let sendEmailFn: jest.Mock<(...args: never[]) => Promise<void>>

  beforeEach(() => {
    jest.clearAllMocks()
    sendEmailFn = jest.fn(async () => {})
  })

  it('sends nothing when no bookings are due a reminder', async () => {
    mockClaimBookings.mockResolvedValue([])

    await sendBookingReminders(sendEmailFn as never)

    expect(sendEmailFn).not.toHaveBeenCalled()
    expect(mockGetMemberById).not.toHaveBeenCalled()
  })

  it('passes the configured window through to the claim query', async () => {
    mockClaimBookings.mockResolvedValue([])

    await sendBookingReminders(sendEmailFn as never, 6)

    expect(mockClaimBookings).toHaveBeenCalledWith(6)
  })

  it('emails the member in their own language', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    mockGetMemberById.mockResolvedValue(member({ lang: MIKLang.SV }))

    await sendBookingReminders(sendEmailFn as never)

    expect(sendEmailFn).toHaveBeenCalledTimes(1)
    const [to, subject, html] = sendEmailFn.mock.calls[0] as unknown as string[]
    expect(to).toBe('matti@example.com')
    expect(subject).toBe('Påminnelse om din kommande MIK-bokning')
    // The registration is what tells the pilot which aircraft this is about.
    expect(html).toContain('OH-STL')
  })

  it('skips a booking whose member has vanished, and still sends the rest', async () => {
    mockClaimBookings.mockResolvedValue([
      booking({ bookingId: 'gone', memberId: 'Ghost1' }),
      booking({ bookingId: 'ok' }),
    ])
    mockGetMemberById.mockImplementation(async (id: string) =>
      id === 'Ghost1' ? undefined : member(),
    )

    await sendBookingReminders(sendEmailFn as never)

    expect(sendEmailFn).toHaveBeenCalledTimes(1)
  })

  it('keeps going when one send fails', async () => {
    mockClaimBookings.mockResolvedValue([
      booking({ bookingId: 'first' }),
      booking({ bookingId: 'second' }),
    ])
    mockGetMemberById.mockResolvedValue(member())
    sendEmailFn.mockRejectedValueOnce(new Error('SMTP down') as never)

    await expect(sendBookingReminders(sendEmailFn as never)).resolves.toBeUndefined()

    expect(sendEmailFn).toHaveBeenCalledTimes(2)
  })

  it('swallows a failure of the claim query rather than killing the cron tick', async () => {
    mockClaimBookings.mockRejectedValue(new Error('database is on fire'))

    await expect(sendBookingReminders(sendEmailFn as never)).resolves.toBeUndefined()

    expect(sendEmailFn).not.toHaveBeenCalled()
  })
})
