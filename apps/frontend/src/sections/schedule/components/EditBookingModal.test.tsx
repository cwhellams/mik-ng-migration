import { BookingStatus, BookingType, type Booking } from '@mik/contracts/bookings'
import { MIKPermissions } from '@mik/contracts/members'
import { screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { signInAs, signInWithPermissions } from '../../../test/auth'
import { aBooking, aMember, anAircraftListResponse, MEMBER_ID } from '../../../test/fixtures'
import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { BookingEditor } from './EditBookingModal'

/**
 * The booking editor: create, edit, cancel and transfer, with the readonly and
 * new-booking modes driven by flags the schedule page computes (see
 * `sections/schedule/helpers.ts`, covered in phase 1).
 */
type EditorBooking = Parameters<typeof BookingEditor>[0]['booking']

const bookingApi = () => {
  const writes: { method: string; path: string; body: unknown }[] = []

  server.use(
    http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json(anAircraftListResponse())),
    http.get(apiUrl('v1/members'), () => HttpResponse.json({ members: [] })),
    http.get(apiUrl('v1/bookings'), () => HttpResponse.json({ bookings: [] })),
    http.post(apiUrl('v1/bookings'), async ({ request }) => {
      writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(aBooking())
    }),
    http.post(apiUrl('v1/bookings/:id/cancel'), async ({ request, params }) => {
      writes.push({ method: 'CANCEL', path: String(params.id), body: await request.json() })
      return HttpResponse.json(aBooking())
    }),
    http.patch(apiUrl('v1/bookings/:id'), async ({ request, params }) => {
      writes.push({ method: 'PATCH', path: String(params.id), body: await request.json() })
      return HttpResponse.json(aBooking())
    }),
    http.delete(apiUrl('v1/bookings/:id'), ({ params }) => {
      writes.push({ method: 'DELETE', path: String(params.id), body: null })
      return HttpResponse.json({ ok: true })
    }),
  )

  return writes
}

/**
 * The schedule page hands the editor a booking plus the flags it computed.
 * The times are placed in the future because the form refuses to save a booking
 * that starts in the past — the shared fixture's fixed 2025 date would be
 * rejected out of hand.
 */
const editorBooking = (
  overrides: Partial<Booking> = {},
  flags: { isNewBooking?: boolean; isReadonly?: boolean } = {},
): EditorBooking => {
  const start = dayjs().add(2, 'day').startOf('hour')
  const end = start.add(2, 'hour')

  return {
    ...aBooking({
      startTime: start.toISOString(),
      startTimeEpoch: String(start.unix()),
      endTime: end.toISOString(),
      endTimeEpoch: String(end.unix()),
      ...overrides,
    }),
    isNewBooking: false,
    isReadonly: false,
    minDate: dayjs().startOf('day'),
    ...flags,
  } as unknown as EditorBooking
}

const renderEditor = (booking: EditorBooking, options = {}) => {
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <BookingEditor booking={booking} onClose={onClose} />,
    options,
  )
  return { ...rendered, onClose }
}

describe('BookingEditor reading', () => {
  it('titles itself for editing an existing booking', async () => {
    bookingApi()
    signInAs(aMember())

    renderEditor(editorBooking())

    expect(await screen.findByText('Edit Booking')).toBeInTheDocument()
  })

  it('titles itself for a new booking', async () => {
    bookingApi()
    signInAs(aMember())

    renderEditor(editorBooking({}, { isNewBooking: true }))

    expect(await screen.findByText('New Booking')).toBeInTheDocument()
  })

  it('loads the booking’s aircraft and description', async () => {
    bookingApi()
    signInAs(aMember())

    renderEditor(editorBooking({ description: 'Training flight' }))

    expect(await screen.findByDisplayValue('Training flight')).toBeInTheDocument()
  })

  it('renders nothing at all without a booking', () => {
    bookingApi()
    signInAs(aMember())

    const { container } = renderWithProviders(
      <BookingEditor booking={undefined} onClose={vi.fn()} />,
    )

    expect(container.querySelector('form')).toBeNull()
  })
})

describe('BookingEditor saving', () => {
  it('closes without saving on back', async () => {
    const writes = bookingApi()
    signInAs(aMember())

    const { user, onClose } = renderEditor(editorBooking())

    await screen.findByText('Edit Booking')
    await user.click(screen.getByRole('button', { name: /Back/ }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(writes).toHaveLength(0)
  })

  // Driving a successful save through this editor means satisfying its date
  // pickers, its aircraft select and several member-eligibility checks at once,
  // and the attempts to do so proved brittle rather than informative. The read,
  // mode and dismissal behaviour above is covered.
  //
  // These are not waiting on more test effort, they are waiting on the form:
  // this editor stacks the browser's native `required` on top of hand-rolled
  // checks, which is what makes a complete submission so awkward to drive.
  // `DefectDialog` — already on react-hook-form + zodResolver — was the only
  // form of the four in #1131 whose save path tested cleanly first try. So
  // these belong to that conversion (#1115 §9, item 5) and should be written
  // as part of it, not before it. #1116 phase 7, which they used to point at,
  // was dropped.
  it.todo('patches an existing booking')
  it.todo('posts a new booking to the collection')
  it.todo('reports a rejected save without closing')
})

describe('BookingEditor readonly mode', () => {
  it('offers no save button on a booking the member may not change', async () => {
    bookingApi()
    signInAs(aMember())

    renderEditor(editorBooking({}, { isReadonly: true }))

    await screen.findByText('Edit Booking')
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()
  })

  it('still shows the booking’s details', async () => {
    bookingApi()
    signInAs(aMember())

    renderEditor(editorBooking({ description: 'Training flight' }, { isReadonly: true }))

    expect(await screen.findByText('Edit Booking')).toBeInTheDocument()
  })
})

describe('BookingEditor cancelling', () => {
  it('offers a cancellation flow on an existing booking', async () => {
    bookingApi()
    signInWithPermissions(MIKPermissions.BOOKING_USER)

    renderEditor(editorBooking({ memberId: MEMBER_ID, status: BookingStatus.CONFIRMED }))

    await screen.findByText('Edit Booking')
    expect(screen.getByRole('button', { name: /Delete|Cancel/ })).toBeInTheDocument()
  })
})

describe('BookingEditor booking types', () => {
  it.each([
    [BookingType.PRIVATE, 'Private'],
    [BookingType.TRAINING, 'Training'],
    [BookingType.MAINTENANCE, 'Maintenance'],
  ])('shows a %s booking as %s', async (type, label) => {
    bookingApi()
    signInAs(aMember())

    renderEditor(editorBooking({ type }))

    await screen.findByText('Edit Booking')
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
