import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FlightLogStatus, type FlightLog } from '@mik/contracts/flight-log'
import { MIKPermissions } from '@mik/contracts/members'

import { signInWithPermissions } from '../../test/auth'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aFlightLog } from '../../test/fixtures'
import { INSTRUCTOR_MEMBER_ID, MEMBER_ID } from '@mik/ui/test/fixtures/cast'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import FlightLogEntry from './FlightLogEntry'

const FLIGHT_ID = 'crew0001'

/**
 * The #1019 shape: Matti1 flew as STU in crew slot 1, instructor Jukka1 sat in crew 2 as
 * FI, and the flight is billed to a third member. Whoever signs in here, this is not the
 * flight they will be invoiced for.
 *
 * The billing fields are null because that is what the server sends a crew reader — a
 * fixture carrying data the API would never hand over would prove nothing about what a
 * crew member actually sees.
 */
const crewFlight = (overrides: Partial<FlightLog> = {}): FlightLog =>
  aFlightLog({
    flightId: FLIGHT_ID,
    status: FlightLogStatus.NEW,
    billableMemberId: 'Sanna1',
    picMemberId: MEMBER_ID,
    picRole: 'STU',
    crew2MemberId: INSTRUCTOR_MEMBER_ID,
    crew2Role: 'FI',
    billingRemarks: null,
    personalRemarks: null,
    invoiceNumber: null,
    validationRemarks: null,
    ...overrides,
  })

const serveFlight = (flight: FlightLog) =>
  server.use(
    http.get(apiUrl(`v1/flight-logs/${FLIGHT_ID}`), () => HttpResponse.json(flight)),
    http.get(apiUrl(`v1/flight-logs/${FLIGHT_ID}/audit`), () => HttpResponse.json({ entries: [] })),
    // The form also asks about the billable member's DTO syllabus and this flight's
    // syllabus link. Neither is what these tests are about.
    http.get(apiUrl('v1/dto/members/:memberId/syllabus'), () => HttpResponse.json(null)),
    http.get(apiUrl(`v1/dto/flight-logs/${FLIGHT_ID}/attempt`), () => HttpResponse.json(null)),
  )

const renderAsCrew = (...permissions: MIKPermissions[]) => {
  signInWithPermissions(...permissions)
  return renderWithProviders(<FlightLogEntry />, {
    route: `/logs/flights/${FLIGHT_ID}`,
    path: '/logs/flights/:flightId',
  })
}

beforeEach(() => serveFlight(crewFlight()))

describe('FlightLogEntry crew access (classic form)', () => {
  // FlightLogEntry picks the mobile review card unless the viewport is sm-up, and the
  // harness's matchMedia stub answers "no match" to everything — which for a
  // `breakpoints.up('sm')` query means phone width. Widen it for this suite so the
  // classic form is what renders; the mobile view has its own suite below.
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = ((query: string) =>
      ({
        ...realMatchMedia(query),
        matches: query.includes('min-width'),
      }) as MediaQueryList) as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  // One render, several assertions: this component is among the most expensive in the
  // suite to mount, and every assertion below observes the same rendered state. Splitting
  // them would multiply full renders of the classic form for no extra coverage — the
  // frontend suite already runs three of these near the 20s testTimeout on CI hardware.
  it('gives a crew member a read-only entry, and says why', async () => {
    renderAsCrew(MIKPermissions.FLIGHTLOG_USER)

    const notice = await screen.findByText(/read-only/i)
    expect(notice).toHaveTextContent(/Student/)

    // no way to save, and the cancel action reads as leaving rather than discarding
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()

    // every field in these is about what the flight costs the member being invoiced
    expect(screen.queryByText('Billing Information')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin Use')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/personal remarks/i)).not.toBeInTheDocument()

    // ...but the change history is still theirs to read
    expect(screen.getByRole('button', { name: /change history/i })).toBeInTheDocument()
  })

  it('lets an instructor edit, and warns them the change is recorded', async () => {
    renderAsCrew(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.DTO_INSTRUCTOR)

    expect(await screen.findByText(/recorded in the change history/i)).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('closes the instructor edit window once the flight is validated', async () => {
    serveFlight(crewFlight({ status: FlightLogStatus.VALIDATED }))
    renderAsCrew(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.DTO_INSTRUCTOR)

    expect(await screen.findByText(/read-only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })

  it('leaves the member who is billed for the flight fully in charge of it', async () => {
    serveFlight(
      crewFlight({
        billableMemberId: MEMBER_ID,
        billingRemarks: 'N/A',
        personalRemarks: 'Smooth flight',
      }),
    )
    renderAsCrew(MIKPermissions.FLIGHTLOG_USER)

    expect(await screen.findByText('Billing Information')).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })
})

describe('FlightLogEntry crew access (mobile review card)', () => {
  it('replaces the Edit action with the read-only notice, and keeps the change history', async () => {
    renderAsCrew(MIKPermissions.FLIGHTLOG_USER)

    expect(await screen.findByText(/read-only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change history/i })).toBeInTheDocument()
  })

  it('keeps the Edit action for an instructor on a still-new flight', async () => {
    renderAsCrew(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.DTO_INSTRUCTOR)

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
  })
})
