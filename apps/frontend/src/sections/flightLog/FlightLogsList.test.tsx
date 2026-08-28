import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { authScenarios, renderAs } from '../../test/auth'
import { aFlightLogListEntry, aFlightLogListResponse } from '../../test/fixtures'
import { INSTRUCTOR_MEMBER_ID, MEMBER_ID } from '@mik/ui/test/fixtures/cast'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import FlightLogsList from './FlightLogsList'

/**
 * The member a filtered list is showing, as the server names them. Jukka is the cast's
 * instructor, and the one a member-admin is most plausibly auditing.
 */
const FILTERED_MEMBER = {
  memberId: INSTRUCTOR_MEMBER_ID,
  firstName: 'Jukka',
  lastName: 'Nieminen',
}

/** Query strings the list actually asked for, in request order. */
let requestedQueries: string[]

const ownFlight = aFlightLogListEntry({
  flightId: 'own00001',
  billableMemberId: MEMBER_ID,
  isOwnFlight: true,
  myCrewRole: 'PIC',
  estimatedCost: 380,
})

/**
 * The #1019 row: Matti1 flew it as a student, their instructor is billed for it. The
 * server leaves `estimatedCost` null on these, because the member will not be invoiced.
 */
const crewFlight = aFlightLogListEntry({
  flightId: 'crew0001',
  billableMemberId: INSTRUCTOR_MEMBER_ID,
  isOwnFlight: false,
  myCrewRole: 'STU',
  estimatedCost: null,
})

beforeEach(() => {
  requestedQueries = []
  server.use(
    http.get(apiUrl('v1/flight-logs'), ({ request }) => {
      const url = new URL(request.url)
      requestedQueries.push(url.search)
      const logs =
        url.searchParams.get('includeCrewFlights') === 'false'
          ? [ownFlight]
          : [ownFlight, crewFlight]
      // Mirrors the server: the list names whoever the crew filter narrowed it to, and
      // only when that is somebody it can resolve (#1249).
      const filteredId =
        url.searchParams.get('anyCrewMemberId') ?? url.searchParams.get('onBoardMemberId')
      return HttpResponse.json(
        aFlightLogListResponse(logs, {
          // more than one page, so the pagination control is there to click
          pages: 3,
          unbilledEstimatedTotal: 380,
          filteredCrewMember: filteredId === FILTERED_MEMBER.memberId ? FILTERED_MEMBER : undefined,
        }),
      )
    }),
  )
})

/**
 * Reports the router's current search string into the DOM.
 *
 * `renderWithProviders` mounts a MemoryRouter, so `window.location` never moves and the
 * only way to observe what the list wrote to the URL is to read it from inside the tree.
 */
const SearchSpy = () => <output data-testid='search'>{useLocation().search}</output>

const searchParams = () => screen.getByTestId('search').textContent ?? ''

/**
 * The row for a flight, found by where its link points rather than by its text — two rows
 * on the same aircraft are otherwise indistinguishable.
 *
 * Polled rather than `findAllByRole('link')`, which would resolve on the header's "New
 * Entry" link before the list itself had loaded.
 */
const rowFor = (flightId: string) =>
  waitFor(() => {
    const row = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.endsWith(`/logs/flights/${flightId}`))
    if (!row) throw new Error(`no row linking to ${flightId}`)
    return row
  })

const renderList = (scenario: Parameters<typeof renderAs>[0], route = '/logs/flights') =>
  renderAs(
    scenario,
    <>
      <FlightLogsList />
      <SearchSpy />
    </>,
    { route },
  )

describe('FlightLogsList crew flights', () => {
  it('asks for crew flights by default', async () => {
    renderList(authScenarios.user)

    await rowFor('crew0001')
    expect(requestedQueries[0]).toContain('includeCrewFlights=true')
  })

  it('reads the toggle off from the URL and asks the server to narrow the list', async () => {
    renderList(authScenarios.user, '/logs/flights?includeCrew=0')

    await rowFor('own00001')
    expect(requestedQueries[0]).toContain('includeCrewFlights=false')
  })

  it('round-trips the toggle through the URL when switched off', async () => {
    const { user } = renderList(authScenarios.user)

    const toggle = await screen.findByRole('switch', { name: /crew/i })
    expect(toggle).toBeChecked()

    await user.click(toggle)

    // The param is written as the opt-out `includeCrew=0`, since the toggle is on by
    // default and an absent param has to keep meaning "on".
    await waitFor(() => expect(searchParams()).toContain('includeCrew=0'))
    await waitFor(() => expect(requestedQueries.at(-1)).toContain('includeCrewFlights=false'))
    expect(toggle).not.toBeChecked()
  })

  it('switches back on again', async () => {
    const { user } = renderList(authScenarios.user, '/logs/flights?includeCrew=0')

    const toggle = await screen.findByRole('switch', { name: /crew/i })
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    await waitFor(() => expect(searchParams()).not.toContain('includeCrew=0'))
    await waitFor(() => expect(requestedQueries.at(-1)).toContain('includeCrewFlights=true'))
  })

  it('marks a crew flight with the role the member flew, and leaves their own rows alone', async () => {
    renderList(authScenarios.user)

    const crewRow = await rowFor('crew0001')
    expect(within(crewRow).getByText('Student')).toBeInTheDocument()

    const ownRow = await rowFor('own00001')
    expect(within(ownRow).queryByText('Student')).not.toBeInTheDocument()
    // The member's own PIC role is not a chip: every row would carry one, and the point
    // of the chip is to say "this one is not yours".
    expect(within(ownRow).queryByText('PIC')).not.toBeInTheDocument()
  })

  it('opens a crew flight, even though the member is not billed for it', async () => {
    // rowFor only resolves at all if the row is a link, which is the point: a crew flight
    // used to render as plain, unopenable text (#1019).
    renderList(authScenarios.user)

    expect(await rowFor('crew0001')).toHaveAttribute('href', '/logs/flights/crew0001')
  })

  it('shows no estimated cost for a flight another member is invoiced for', async () => {
    renderList(authScenarios.user)

    const crewRow = await rowFor('crew0001')
    expect(within(crewRow).getByText('—')).toBeInTheDocument()

    const ownRow = await rowFor('own00001')
    expect(within(ownRow).getByText(/380/)).toBeInTheDocument()
  })

  it('hides the toggle from a flightlog admin, whose list is not their own log', async () => {
    renderList(authScenarios.admin)

    await rowFor('own00001')
    expect(screen.queryByRole('switch', { name: /crew/i })).not.toBeInTheDocument()
  })

  it('keeps the toggle when paging', async () => {
    const { user } = renderList(authScenarios.user, '/logs/flights?includeCrew=0')

    await rowFor('own00001')
    await user.click(await screen.findByRole('button', { name: 'Go to page 2' }))

    await waitFor(() => expect(searchParams()).toContain('page=2'))
    expect(searchParams()).toContain('includeCrew=0')
  })
})

/**
 * #1249: `/logs?anyCrewMemberId=<id>` narrowed the list to one member with nothing on the
 * page saying so, which reads as "my flight log has gone wrong" rather than "I am looking
 * at somebody else's".
 */
describe('FlightLogsList member filter', () => {
  const filteredRoute = `/logs/flights?anyCrewMemberId=${FILTERED_MEMBER.memberId}`

  const chip = () => screen.findByText(/Flights of/)

  it('names the member the list was narrowed to', async () => {
    renderList(authScenarios.admin, filteredRoute)

    expect(await chip()).toHaveTextContent('Flights of Jukka Nieminen')
  })

  it('reads onBoardMemberId as well, since the server honours both', async () => {
    renderList(authScenarios.admin, `/logs/flights?onBoardMemberId=${FILTERED_MEMBER.memberId}`)

    expect(await chip()).toHaveTextContent('Flights of Jukka Nieminen')
    expect(requestedQueries[0]).toContain(`onBoardMemberId=${FILTERED_MEMBER.memberId}`)
  })

  it('falls back to the raw id while the name is still in flight', async () => {
    // The label has to be there on the first paint, from the URL alone: a heading that
    // starts unlabelled and then gains a name is the same confusion, just briefer.
    server.use(
      http.get(apiUrl('v1/flight-logs'), async () => {
        await delay('infinite')
      }),
    )
    renderList(authScenarios.admin, filteredRoute)

    expect(await chip()).toHaveTextContent(`Flights of ${FILTERED_MEMBER.memberId}`)
  })

  it.each(Object.values(authScenarios))(
    'shows no label on an unfiltered list for $name',
    async (scenario) => {
      renderList(scenario)

      await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0))
      expect(screen.queryByText(/Flights of/)).not.toBeInTheDocument()
    },
  )

  it('shows no label when the filter names the reader themselves', async () => {
    // Nobody needs telling they are looking at their own log — and the server strips the
    // filter on that path anyway, so there would be nothing to name.
    renderList(authScenarios.user, `/logs/flights?anyCrewMemberId=${MEMBER_ID}`)

    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0))
    expect(screen.queryByText(/Flights of/)).not.toBeInTheDocument()
  })

  it('clears the filter from the URL and from the request', async () => {
    const { user } = renderList(authScenarios.admin, filteredRoute)

    await chip()
    await user.click(screen.getByRole('button', { name: 'Show all flights' }))

    await waitFor(() => expect(searchParams()).not.toContain('anyCrewMemberId'))
    // Asserting only the URL would pass on a filter that never stopped reaching the
    // server, which is the half that decides what the list actually contains.
    await waitFor(() => expect(requestedQueries.at(-1)).not.toContain('anyCrewMemberId'))
    expect(screen.queryByText(/Flights of/)).not.toBeInTheDocument()
  })

  it('keeps the filter through an aircraft change', async () => {
    // This carry-over is what setListParams exists for, and it was untested.
    const { user } = renderList(authScenarios.admin, filteredRoute)

    await chip()
    await user.click(screen.getByRole('combobox', { name: /aircraft/i }))
    await user.click(await screen.findByRole('option', { name: 'OH-STL' }))

    await waitFor(() => expect(searchParams()).toContain('aircraftRegistration=OH-STL'))
    expect(searchParams()).toContain(`anyCrewMemberId=${FILTERED_MEMBER.memberId}`)
    expect(await chip()).toBeInTheDocument()
  })

  it('keeps the filter through a crew-toggle flip', async () => {
    const { user } = renderList(authScenarios.user, filteredRoute)

    await user.click(await screen.findByRole('switch', { name: /crew/i }))

    await waitFor(() => expect(searchParams()).toContain('includeCrew=0'))
    expect(searchParams()).toContain(`anyCrewMemberId=${FILTERED_MEMBER.memberId}`)
  })

  it('offers the way back to the profile to a members admin', async () => {
    renderList(authScenarios.admin, filteredRoute)

    expect(await screen.findByRole('link', { name: 'Back to member profile' })).toHaveAttribute(
      'href',
      `/club/members/${FILTERED_MEMBER.memberId}`,
    )
  })

  it('offers no profile link to someone who cannot open the profile', async () => {
    // The profile page is MEMBER_ADMIN's; this filter is FLIGHTLOG_ADMIN's. A link into a
    // 403 is worse than no link.
    renderList(authScenarios.user, filteredRoute)

    await chip()
    expect(screen.queryByRole('link', { name: 'Back to member profile' })).not.toBeInTheDocument()
  })
})
