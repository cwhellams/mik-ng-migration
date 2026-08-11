/**
 * Tests for the push notification send loop.
 *
 * Separate file for the same reason as bookingReminderWorker.sendLoop.test.ts:
 * jest.unstable_mockModule on the DB queries cannot coexist with the
 * real-Postgres assertions in pushNotificationWorker.test.ts.
 */

import 'dotenv/config'
import { jest } from '@jest/globals'
import { MIKLang } from '../../src/routes/members/models.ts'
import { booking, member, subscription } from './sendLoopFixtures.ts'

jest.unstable_mockModule('../../src/db/push-queries.ts', () => ({
  claimUpcomingBookingsForPushReminder: jest.fn(),
  getPushSubscriptionsByMemberId: jest.fn(),
  deletePushSubscriptionByEndpointGlobal: jest.fn(),
}))

jest.unstable_mockModule('../../src/db/member-queries.ts', () => ({
  getMemberById: jest.fn(),
}))

const {
  claimUpcomingBookingsForPushReminder,
  getPushSubscriptionsByMemberId,
  deletePushSubscriptionByEndpointGlobal,
} = await import('../../src/db/push-queries.ts')
const { getMemberById } = await import('../../src/db/member-queries.ts')
const { sendPushReminders } = await import('../../src/workers/pushNotificationWorker.ts')

const mockClaimBookings = claimUpcomingBookingsForPushReminder as jest.MockedFunction<
  typeof claimUpcomingBookingsForPushReminder
>
const mockGetSubscriptions = getPushSubscriptionsByMemberId as jest.MockedFunction<
  typeof getPushSubscriptionsByMemberId
>
const mockDeleteSubscription = deletePushSubscriptionByEndpointGlobal as jest.MockedFunction<
  typeof deletePushSubscriptionByEndpointGlobal
>
const mockGetMemberById = getMemberById as jest.MockedFunction<typeof getMemberById>

describe('sendPushReminders', () => {
  let sendWebPushFn: jest.Mock<(...args: never[]) => Promise<{ ok: boolean; gone?: boolean }>>

  beforeEach(() => {
    jest.clearAllMocks()
    sendWebPushFn = jest.fn(async () => ({ ok: true }))
    mockGetSubscriptions.mockResolvedValue([subscription('https://push.example/abc')])
    mockGetMemberById.mockResolvedValue(member())
  })

  it('sends nothing when no bookings are due a reminder', async () => {
    mockClaimBookings.mockResolvedValue([])

    await sendPushReminders(sendWebPushFn as never)

    expect(sendWebPushFn).not.toHaveBeenCalled()
  })

  it('pushes to every device the member has registered', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    mockGetSubscriptions.mockResolvedValue([
      subscription('https://push.example/phone'),
      subscription('https://push.example/laptop'),
    ])

    await sendPushReminders(sendWebPushFn as never)

    expect(sendWebPushFn).toHaveBeenCalledTimes(2)
    const payload = (sendWebPushFn.mock.calls[0] as unknown as [unknown, Record<string, string>])[1]
    expect(payload.title).toBe('Varaus alkaa tunnin kuluttua')
    expect(payload.body).toContain('OH-STL')
    expect(payload.url).toBe('/schedule')
  })

  it('localises the payload', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    mockGetMemberById.mockResolvedValue(member({ lang: MIKLang.SV }))

    await sendPushReminders(sendWebPushFn as never)

    const payload = (sendWebPushFn.mock.calls[0] as unknown as [unknown, Record<string, string>])[1]
    expect(payload.title).toBe('Bokning börjar om en timme')
  })

  it('sends nothing for a member who has not opted in to push', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    mockGetSubscriptions.mockResolvedValue([])

    await sendPushReminders(sendWebPushFn as never)

    expect(sendWebPushFn).not.toHaveBeenCalled()
    expect(mockDeleteSubscription).not.toHaveBeenCalled()
  })

  it('skips a booking whose member has vanished', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    mockGetMemberById.mockResolvedValue(undefined as never)

    await sendPushReminders(sendWebPushFn as never)

    expect(sendWebPushFn).not.toHaveBeenCalled()
  })

  it('deletes a subscription the push service reports as gone', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    mockGetSubscriptions.mockResolvedValue([subscription('https://push.example/dead')])
    sendWebPushFn.mockResolvedValue({ ok: false, gone: true } as never)

    await sendPushReminders(sendWebPushFn as never)

    expect(mockDeleteSubscription).toHaveBeenCalledWith('https://push.example/dead')
  })

  it('keeps a subscription that failed for a reason other than being gone', async () => {
    mockClaimBookings.mockResolvedValue([booking()])
    sendWebPushFn.mockResolvedValue({ ok: false, gone: false } as never)

    await sendPushReminders(sendWebPushFn as never)

    expect(mockDeleteSubscription).not.toHaveBeenCalled()
  })

  it('swallows a failure of the claim query rather than killing the cron tick', async () => {
    mockClaimBookings.mockRejectedValue(new Error('database is on fire'))

    await expect(sendPushReminders(sendWebPushFn as never)).resolves.toBeUndefined()

    expect(sendWebPushFn).not.toHaveBeenCalled()
  })
})
