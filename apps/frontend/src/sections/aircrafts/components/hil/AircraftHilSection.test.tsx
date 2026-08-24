import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  AIRCRAFT_REGISTRATION,
  aHilDetail,
  aHilExtension,
  aHilLinkedDefect,
  aHilOverview,
} from '../../../../test/fixtures'
import { apiUrl } from '../../../../test/msw/handlers'
import { server } from '../../../../test/msw/server'
import { renderWithProviders } from '../../../../test/renderWithProviders'
import { AircraftHilSection } from './AircraftHilSection'

/**
 * The site reported in issue #1255. The hold item list pushes three values
 * through translation strings — the linked defect's description, an extension's
 * name and the defect category — and all three were HTML-escaped on the way.
 */
const hilApi = (overview: ReturnType<typeof aHilOverview>) =>
  server.use(http.get(apiUrl('v1/aircraft-hil/overview'), () => HttpResponse.json([overview])))

const renderSection = (canEdit = false) =>
  renderWithProviders(
    <AircraftHilSection aircraftRegistration={AIRCRAFT_REGISTRATION} canEdit={canEdit} />,
  )

describe('AircraftHilSection', () => {
  it('links to the linked defect with its description verbatim (issue #1255)', async () => {
    hilApi(
      aHilOverview({
        hil: [aHilDetail({ defects: [aHilLinkedDefect({ description: 'Nav light U/S' })] })],
      }),
    )

    renderSection()

    expect(
      await screen.findByRole('button', { name: 'Open journey log book 12 — Nav light U/S' }),
    ).toBeInTheDocument()
  })

  it("shows an extension's name unescaped, apostrophe and all", async () => {
    hilApi(
      aHilOverview({
        hil: [aHilDetail({ extensions: [aHilExtension({ name: "Niko O'Brien" })] })],
      }),
    )

    renderSection()

    // `aircraft.hil.extensionRow` interpolates the name, so this was `O&#39;Brien`.
    expect(
      await screen.findByText(/01\.02\.2026: extended to 01\.03\.2026 \(Niko O'Brien\)/),
    ).toBeInTheDocument()
  })

  it('shows the defect category chip', async () => {
    hilApi(aHilOverview({ hil: [aHilDetail({ defectCat: 'B' })] }))

    renderSection()

    expect(await screen.findByText('Cat B')).toBeInTheDocument()
  })

  it('says so when the aircraft has no hold items', async () => {
    hilApi(aHilOverview({ hil: [] }))

    renderSection()

    expect(await screen.findByText('No hold items on the list')).toBeInTheDocument()
  })
})
