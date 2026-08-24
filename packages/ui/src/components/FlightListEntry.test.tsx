import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  FlightLogBanner,
  FlightLogDate,
  FlightLogTimeline,
  ViewFlightDate,
} from './FlightListEntry'
import { renderWithProviders } from '../test/renderWithProviders'

/**
 * The pieces a flight-log row is assembled from, shared by the member app's
 * logbook and the admin app's invoicing screens.
 *
 * Tested for the decisions they make — which timeline markers appear, whether a
 * date links anywhere, which timezone the times are rendered in — not for
 * layout. The suite runs under TZ=Europe/Helsinki, so `local` is +02:00 in
 * January, which is what makes the UTC-vs-local assertions mean something.
 */
const TAKEOFF = '2025-01-15T10:00:00.000Z'
const LANDING = '2025-01-15T11:30:00.000Z'
const OFF_BLOCK = '2025-01-15T09:45:00.000Z'
const ON_BLOCK = '2025-01-15T11:45:00.000Z'

const timeline = (props: Partial<Parameters<typeof FlightLogTimeline>[0]> = {}) => (
  <FlightLogTimeline
    departureAirport='EFNU'
    arrivalAirport='EFHK'
    takeoffTimeUtc={TAKEOFF}
    landingTimeUtc={LANDING}
    flightTime='1:30'
    {...props}
  />
)

describe('FlightLogBanner', () => {
  it('shows the registration and the flight type', () => {
    renderWithProviders(<FlightLogBanner aircraftRegistration='OH-STL' flightType='Training' />)

    expect(screen.getByText('OH-STL')).toBeInTheDocument()
    expect(screen.getByText('Training')).toBeInTheDocument()
  })
})

describe('FlightLogTimeline', () => {
  it('shows both airports and the flight time', () => {
    renderWithProviders(timeline())

    expect(screen.getByText('EFNU')).toBeInTheDocument()
    expect(screen.getByText('EFHK')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('shows only takeoff and landing when there is no block data', () => {
    renderWithProviders(timeline())

    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('11:30')).toBeInTheDocument()
    expect(screen.queryByText('09:45')).not.toBeInTheDocument()
    expect(screen.queryByText('11:45')).not.toBeInTheDocument()
  })

  it('adds the off-block and on-block markers when both are known', () => {
    // Both, not either: a half-populated block row would imply a duration the
    // data cannot support.
    renderWithProviders(timeline({ offBlockTimeUtc: OFF_BLOCK, onBlockTimeUtc: ON_BLOCK }))

    expect(screen.getByText('09:45')).toBeInTheDocument()
    expect(screen.getByText('11:45')).toBeInTheDocument()
  })

  it('ignores an off-block time with no matching on-block time', () => {
    renderWithProviders(timeline({ offBlockTimeUtc: OFF_BLOCK }))

    expect(screen.queryByText('09:45')).not.toBeInTheDocument()
  })

  it('renders the times in the member’s chosen timezone', () => {
    renderWithProviders(timeline(), { timezone: 'local' })

    // 10:00Z is 12:00 in Helsinki in January.
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.queryByText('10:00')).not.toBeInTheDocument()
  })

  it('shows the block time only when there is a block row to explain', () => {
    const { unmount } = renderWithProviders(
      timeline({ offBlockTimeUtc: OFF_BLOCK, onBlockTimeUtc: ON_BLOCK, blockTime: '2:00' }),
    )
    expect(screen.getByText(/2:00/)).toBeInTheDocument()
    unmount()

    renderWithProviders(timeline({ blockTime: '2:00' }))
    expect(screen.queryByText(/2:00/)).not.toBeInTheDocument()
  })

  it('falls back to the secondary time when there is no block row', () => {
    // The AJLB view has no off/on-block data and shows aircraft total time here
    // instead.
    renderWithProviders(timeline({ secondaryTime: 'TT 1234:56' }))

    expect(screen.getByText('TT 1234:56')).toBeInTheDocument()
  })

  it('prefers the block row over the secondary time when both could apply', () => {
    renderWithProviders(
      timeline({
        offBlockTimeUtc: OFF_BLOCK,
        onBlockTimeUtc: ON_BLOCK,
        blockTime: '2:00',
        secondaryTime: 'TT 1234:56',
      }),
    )

    expect(screen.queryByText('TT 1234:56')).not.toBeInTheDocument()
  })
})

describe.each([
  ['FlightLogDate', FlightLogDate],
  ['ViewFlightDate', ViewFlightDate],
])('%s', (_name, DateComponent) => {
  it('links to the flight when asked to', () => {
    renderWithProviders(<DateComponent flightId='fi_inst1' date={TAKEOFF} link />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/logs/flights/fi_inst1')
  })

  it('renders as plain text when it is not a link', () => {
    // The invoicing screens reuse these inside their own row links, where a
    // nested anchor would be invalid markup.
    renderWithProviders(<DateComponent flightId='fi_inst1' date={TAKEOFF} link={false} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
