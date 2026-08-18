import type { Defect } from '@mik/contracts/defects'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../../test/auth'
import { aMember, AIRCRAFT_REGISTRATION } from '../../../test/fixtures'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { ExistingDefects } from './ExistingDefects'

const aDefect = (overrides: Partial<Defect> = {}): Defect =>
  ({
    defectId: 'def-1',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    description: 'Nose wheel shimmy on landing',
    status: 'ACTIVE',
    flightMins: 285_000,
    rows: 1,
    createdBy: 'Matti1',
    createdAt: '2025-06-02T09:00:00.000Z',
    flightId: null,
    hilId: null,
    resolvedNoteId: null,
    ...overrides,
  }) as unknown as Defect

describe('ExistingDefects', () => {
  it('renders nothing when there are no defects', () => {
    signInAs(aMember())
    const { container } = renderWithProviders(
      <ExistingDefects
        defects={[]}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing without an aircraft registration, even with defects', () => {
    signInAs(aMember())
    const { container } = renderWithProviders(
      <ExistingDefects defects={[aDefect()]} onChanged={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('lists every defect already reported against the flight', () => {
    signInAs(aMember())
    renderWithProviders(
      <ExistingDefects
        defects={[aDefect({ description: 'Nose wheel shimmy on landing' })]}
        aircraftRegistration={AIRCRAFT_REGISTRATION}
        onChanged={vi.fn()}
      />,
    )

    expect(screen.getByText('Nose wheel shimmy on landing')).toBeInTheDocument()
  })
})
