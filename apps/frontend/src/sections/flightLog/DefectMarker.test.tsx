import type { Defect } from '@mik/contracts/defects'
import { screen } from '@testing-library/react'
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
})
