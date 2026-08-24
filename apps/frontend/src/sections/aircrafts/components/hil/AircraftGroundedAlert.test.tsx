import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { AIRCRAFT_REGISTRATION, aHilLinkedDefect, aHilOverview } from '../../../../test/fixtures'
import { apiUrl } from '../../../../test/msw/handlers'
import { server } from '../../../../test/msw/server'
import { renderWithProviders } from '../../../../test/renderWithProviders'
import { AircraftGroundedAlert } from './AircraftGroundedAlert'

/**
 * One of the two sites in issue #1255: the grounding banner links to each open
 * defect through `aircraft.hil.openLogbook`, so a description containing `/`
 * or `'` was printed with HTML entities.
 */
const hilApi = (overview: ReturnType<typeof aHilOverview>) =>
  server.use(http.get(apiUrl('v1/aircraft-hil/overview'), () => HttpResponse.json([overview])))

const renderAlert = () =>
  renderWithProviders(
    <AircraftGroundedAlert aircraftRegistration={AIRCRAFT_REGISTRATION} onShowHil={vi.fn()} />,
  )

describe('AircraftGroundedAlert', () => {
  it('links to a defect whose description contains a slash, unescaped (issue #1255)', async () => {
    hilApi(
      aHilOverview({
        isGrounded: true,
        openDefectCount: 1,
        openDefects: [aHilLinkedDefect({ description: 'Nav light U/S' })],
        hil: [],
      }),
    )

    renderAlert()

    expect(
      await screen.findByRole('button', { name: 'Open journey log book 12 — Nav light U/S' }),
    ).toBeInTheDocument()
  })

  it('does not escape an apostrophe in a defect description', async () => {
    hilApi(
      aHilOverview({
        isGrounded: true,
        openDefectCount: 1,
        openDefects: [aHilLinkedDefect({ description: "Pilot's seat loose" })],
        hil: [],
      }),
    )

    renderAlert()

    const link = await screen.findByRole('button', { name: /Pilot's seat loose/ })
    expect(link.textContent).not.toContain('&#39;')
  })

  it('renders nothing when the aircraft is neither grounded nor holding items', async () => {
    hilApi(aHilOverview({ hil: [] }))

    const { container } = renderAlert()

    // Nothing to warn about — the banner must stay out of the way entirely.
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
