import type { Defect } from '@mik/contracts/defects'
import type { Remark } from '@mik/contracts/remarks'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { signInAs } from '../../../test/auth'
import { aMember, AIRCRAFT_REGISTRATION } from '../../../test/fixtures'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { DefectsAndRemarksSection } from './DefectsAndRemarksSection'

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

const aRemark = (overrides: Partial<Remark> = {}): Remark => ({
  remarkId: 'remark-1',
  flightId: 'fi_inst1',
  description: 'Oil stain noticed on the ramp, wiped off',
  createdAt: '2025-06-02T09:00:00.000Z',
  createdBy: 'Matti1',
  updatedAt: '2025-06-02T09:00:00.000Z',
  updatedBy: 'Matti1',
  ...overrides,
})

const baseProps = {
  reportedDefects: [] as string[],
  onReportedDefectsChange: vi.fn(),
  canReportDefects: true,
  existingDefects: [] as Defect[],
  aircraftRegistration: AIRCRAFT_REGISTRATION,
  onExistingDefectsChanged: vi.fn(),
  reportedRemarks: [] as string[],
  onReportedRemarksChange: vi.fn(),
  canReportRemarks: true,
  existingRemarks: [] as Remark[],
}

describe('DefectsAndRemarksSection', () => {
  it('shows the combined intro note, with the Add Defect and Add Remark buttons next to each other', () => {
    signInAs(aMember())
    // No members carry the PLANE_CAPTAIN role by default, so FleetManagerContacts
    // renders nothing -- this test is about the surrounding section, not that block.
    renderWithProviders(<DefectsAndRemarksSection {...baseProps} />)

    expect(
      screen.getByText(/If you found any defects or other aircraft during this flight/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Please note that a reported defect will ground the aircraft/),
    ).toBeInTheDocument()

    const addDefect = screen.getByRole('button', { name: 'Add defect' })
    const addRemark = screen.getByRole('button', { name: 'Add remark' })
    expect(addDefect).toBeInTheDocument()
    expect(addRemark).toBeInTheDocument()
    // "next to each other": siblings under the same row container.
    expect(addDefect.parentElement).toBe(addRemark.parentElement)
  })

  it('adds a defect row, not a remark row, when Add Defect is clicked', async () => {
    signInAs(aMember())
    const onReportedDefectsChange = vi.fn()
    const { user } = renderWithProviders(
      <DefectsAndRemarksSection {...baseProps} onReportedDefectsChange={onReportedDefectsChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Add defect' }))

    expect(onReportedDefectsChange).toHaveBeenCalledWith([''])
  })

  it('adds a remark row, not a defect row, when Add Remark is clicked', async () => {
    signInAs(aMember())
    const onReportedRemarksChange = vi.fn()
    const { user } = renderWithProviders(
      <DefectsAndRemarksSection {...baseProps} onReportedRemarksChange={onReportedRemarksChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Add remark' }))

    expect(onReportedRemarksChange).toHaveBeenCalledWith([''])
  })

  it('shows already-reported defects and already-logged remarks', () => {
    signInAs(aMember())
    renderWithProviders(
      <DefectsAndRemarksSection
        {...baseProps}
        existingDefects={[aDefect()]}
        existingRemarks={[aRemark()]}
      />,
    )

    expect(screen.getByText('Nose wheel shimmy on landing')).toBeInTheDocument()
    expect(screen.getByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
  })

  it('hides the Add Defect button once the entry can no longer take new defects', () => {
    signInAs(aMember())
    renderWithProviders(<DefectsAndRemarksSection {...baseProps} canReportDefects={false} />)

    expect(screen.queryByRole('button', { name: 'Add defect' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add remark' })).toBeInTheDocument()
  })

  it('hides the Add Remark button once the entry can no longer take new remarks', () => {
    signInAs(aMember())
    renderWithProviders(<DefectsAndRemarksSection {...baseProps} canReportRemarks={false} />)

    expect(screen.queryByRole('button', { name: 'Add remark' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add defect' })).toBeInTheDocument()
  })
})
