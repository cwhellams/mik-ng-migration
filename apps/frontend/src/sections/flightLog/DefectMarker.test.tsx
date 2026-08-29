import type { Defect } from '@mik/contracts/defects'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../test/auth'
import { AIRCRAFT_REGISTRATION, aMember, MEMBER_ID } from '../../test/fixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { DefectMarker } from './DefectMarker'

const aDefect = (overrides: Partial<Defect> = {}): Defect =>
  ({
    defectId: 'def-1',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Nose wheel shimmy on landing',
    status: 'ACTIVE',
    flightMins: 285_000,
    recordedOn: '2025-06-02',
    rows: 1,
    createdBy: MEMBER_ID,
    createdAt: '2025-06-02T09:00:00.000Z',
    flightId: null,
    hilId: null,
    resolvedNoteId: null,
    ...overrides,
  }) as unknown as Defect

describe('DefectMarker', () => {
  it('shows the recorded date next to the marker when it renders on its own row', async () => {
    signInAs(aMember())

    renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        recordedDate='2025-06-02T09:00:00.000Z'
      />,
    )

    expect(await screen.findByText('02.06.2025')).toBeInTheDocument()
  })

  it('omits the date when the marker renders inline on its anchor flight row', async () => {
    signInAs(aMember())

    renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
      />,
    )

    expect(await screen.findByText('Nose wheel shimmy on landing')).toBeInTheDocument()
    expect(screen.queryByText('02.06.2025')).not.toBeInTheDocument()
  })

  it('opens the details dialog right away when it is the highlighted marker', async () => {
    signInAs(aMember())

    renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted
      />,
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('opens when a second link highlights it without remounting the page', async () => {
    // The case a mount-time initializer misses. `LogbookPage` keys its markers
    // by defectId and a query-param-only navigation matches the same route, so
    // following one findings-search link and then another to a different
    // defect on the same page re-renders these markers rather than remounting
    // them.
    signInAs(aMember())

    const { rerender } = renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted={false}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted
      />,
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('closes again when the highlight moves to another marker', async () => {
    signInAs(aMember())

    const { rerender } = renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted
      />,
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    rerender(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted={false}
      />,
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('stays closed once dismissed, while it is still the highlighted marker', async () => {
    // The marker keeps re-rendering for reasons of its own (a sibling's edit
    // refetches the page). Reopening on each of those would make the dialog
    // impossible to get rid of.
    signInAs(aMember())

    const { user, rerender } = renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted
      />,
    )

    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    rerender(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
        highlighted
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed when it is not the highlighted marker', async () => {
    signInAs(aMember())

    renderWithProviders(
      <DefectMarker
        defect={aDefect()}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
      />,
    )

    await screen.findByText('Nose wheel shimmy on landing')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
