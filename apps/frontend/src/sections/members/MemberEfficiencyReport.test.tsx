import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BookingStatus, BookingType, CancellationReason } from '@mik/contracts/bookings'
import type {
  MemberEfficiencyEntry,
  MemberEfficiencyResponse,
} from '@mik/contracts/member-efficiency'
import { MIKPermissions } from '@mik/contracts/members'

import { renderAs } from '../../test/auth'
import { aMember, aRoleWithPermissions } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import MemberEfficiencyReport from './MemberEfficiencyReport'

const MEMBER_ID = 'Matti1'
const EFFICIENCY_PATH = `v1/members/${MEMBER_ID}/reservation-efficiency`

const membersAdmin = aMember({
  memberId: 'MembersAdmin1',
  roles: [aRoleWithPermissions(MIKPermissions.MEMBER_ADMIN)],
})

const anEntry = (overrides: Partial<MemberEfficiencyEntry> = {}): MemberEfficiencyEntry => ({
  bookingId: 'bk-1',
  registration: 'OH-STL',
  status: BookingStatus.CONFIRMED,
  type: BookingType.PRIVATE,
  startTime: '2026-07-13T09:00:00.000Z',
  endTime: '2026-07-13T12:00:00.000Z',
  reservedMins: 180,
  flightMins: 150,
  efficiencyPct: 83.33,
  flightCount: 1,
  headGapMins: 10,
  tailGapMins: 10,
  isUnderused: false,
  cancellationReason: null,
  cancellationNote: null,
  cancelledAt: null,
  cancelledNoticeHours: null,
  ...overrides,
})

const aResponse = (
  entries: MemberEfficiencyEntry[],
  summary: Partial<MemberEfficiencyResponse['summary']> = {},
): MemberEfficiencyResponse => ({
  memberId: MEMBER_ID,
  from: '2025-08-20T00:00:00.000Z',
  to: '2026-08-20T23:59:59.000Z',
  summary: {
    bookingCount: entries.length,
    cancelledCount: 0,
    underusedCount: 0,
    noShowCount: 0,
    totalReservedMins: 180,
    totalFlightMins: 150,
    memberEfficiencyPct: 72.5,
    clubEfficiencyPct: 61.5,
    ...summary,
  },
  entries,
})

const mockReport = (response: MemberEfficiencyResponse, onRequest?: (url: URL) => void) => {
  server.use(
    http.get(apiUrl(`v1/members/${MEMBER_ID}`), () => HttpResponse.json(aMember())),
    http.get(apiUrl(EFFICIENCY_PATH), ({ request }) => {
      onRequest?.(new URL(request.url))
      return HttpResponse.json(response)
    }),
  )
}

const renderReport = () =>
  renderAs(
    { name: 'members admin', member: membersAdmin, sudo: true },
    <MemberEfficiencyReport />,
    {
      route: `/club/members/${MEMBER_ID}/efficiency`,
      path: '/club/members/:memberId/efficiency',
    },
  )

describe('MemberEfficiencyReport', () => {
  afterEach(() => vi.useRealTimers())

  it('should put the member figure next to the club figure so they can be compared', async () => {
    mockReport(aResponse([anEntry()]))

    renderReport()

    expect(await screen.findByText('72.5%')).toBeInTheDocument()
    expect(screen.getByText('61.5%')).toBeInTheDocument()
    expect(screen.getByText('02:30 flown of 03:00 reserved')).toBeInTheDocument()
    // The booking's own figure sits in the row, not in the summary.
    expect(screen.getByText('83.3%')).toBeInTheDocument()
  })

  it('should list a booking with its reserved window, flown time and efficiency', async () => {
    mockReport(aResponse([anEntry()]))

    renderReport()

    expect(await screen.findByText('OH-STL')).toBeInTheDocument()
    expect(screen.getByText('09:00–12:00')).toBeInTheDocument()
    expect(screen.getByText('03:00')).toBeInTheDocument()
    expect(screen.getByText('02:30')).toBeInTheDocument()
    expect(screen.getByText('Flown')).toBeInTheDocument()
  })

  it('should explain why a booking counts as underused', async () => {
    mockReport(
      aResponse(
        [anEntry({ bookingId: 'bk-late', isUnderused: true, headGapMins: 75, tailGapMins: 0 })],
        { underusedCount: 1 },
      ),
    )

    const { user } = renderReport()

    const chip = await screen.findByText('Underused')
    await user.hover(chip)

    expect(await screen.findByText(/stood idle 01:15 before the first flight/i)).toBeInTheDocument()
  })

  it('should show a cancellation with its reason and how much notice was given', async () => {
    mockReport(
      aResponse(
        [
          anEntry({
            bookingId: 'bk-cancelled',
            status: BookingStatus.CANCELLED,
            flightMins: 0,
            flightCount: 0,
            efficiencyPct: 0,
            headGapMins: null,
            tailGapMins: null,
            cancellationReason: CancellationReason.WEATHER_DEPARTURE,
            cancellationNote: 'Fog at EFHF',
            cancelledAt: '2026-07-13T07:30:00.000Z',
            cancelledNoticeHours: 1.5,
          }),
        ],
        { cancelledCount: 1 },
      ),
    )

    renderReport()

    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Weather (Departure) · 1.5 h notice')).toBeInTheDocument()
  })

  it('should call out a cancellation that came after the reservation had started', async () => {
    mockReport(
      aResponse(
        [
          anEntry({
            bookingId: 'bk-late-cancel',
            status: BookingStatus.CANCELLED,
            flightMins: 0,
            flightCount: 0,
            efficiencyPct: 0,
            cancellationReason: CancellationReason.OTHER,
            cancelledAt: '2026-07-13T10:00:00.000Z',
            cancelledNoticeHours: -1,
          }),
        ],
        { cancelledCount: 1 },
      ),
    )

    renderReport()

    expect(
      await screen.findByText('Other · Cancelled after the reservation had started'),
    ).toBeInTheDocument()
  })

  it('should mark a reservation nobody flew as not flown', async () => {
    mockReport(
      aResponse(
        [
          anEntry({
            bookingId: 'bk-noshow',
            flightMins: 0,
            flightCount: 0,
            efficiencyPct: 0,
            headGapMins: null,
            tailGapMins: null,
          }),
        ],
        { noShowCount: 1 },
      ),
    )

    renderReport()

    expect(await screen.findByText('Not flown')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('should ask for the last twelve months by default', async () => {
    // `shouldAdvanceTime` keeps SWR's and waitFor's timers ticking while the starting
    // point is pinned — a fully frozen clock never resolves the fetch.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const seen: URL[] = []
    mockReport(aResponse([anEntry()]), (url) => seen.push(url))

    renderReport()

    await waitFor(() => expect(seen).toHaveLength(1))
    // The window is a whole local day either end, and the harness pins the timezone to
    // Europe/Helsinki, so midnight on the 20th is 21:00 UTC the evening before.
    expect(seen[0]!.searchParams.get('from')).toBe('2025-08-19T21:00:00.000Z')
    expect(seen[0]!.searchParams.get('to')).toBe('2026-08-20T20:59:59.999Z')
  })

  it('should refuse a period that runs backwards rather than asking the API for it', async () => {
    const seen: URL[] = []
    mockReport(aResponse([anEntry()]), (url) => seen.push(url))

    const { user } = renderReport()

    await screen.findByText('OH-STL')

    // The date field is a set of segments, not one text input; the year alone is
    // enough to push the start of the period past its end.
    const [fromYear] = screen.getAllByRole('spinbutton', { name: 'Year' })
    await user.click(fromYear!)
    await user.keyboard('2099')

    expect(
      await screen.findByText('The start date cannot be after the end date'),
    ).toBeInTheDocument()
    expect(seen.some((url) => url.searchParams.get('from')?.startsWith('2099'))).toBe(false)
  })

  it('should show an empty state when the member reserved nothing in the period', async () => {
    mockReport(
      aResponse([], {
        bookingCount: 0,
        totalReservedMins: 0,
        totalFlightMins: 0,
        memberEfficiencyPct: 0,
      }),
    )

    renderReport()

    expect(await screen.findByText('No reservations in this period')).toBeInTheDocument()
  })
})
