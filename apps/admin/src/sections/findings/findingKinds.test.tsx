import { screen } from '@testing-library/react'
import type { Finding } from '@mik/contracts/findings'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/renderWithProviders'
import { KindChip, StatusChip } from './findingKinds'
import { findingLocation } from './findingLocation'

const aFinding = (overrides: Partial<Finding> = {}): Finding => ({
  findingId: 'f-1',
  kind: 'REMARK',
  aircraftRegistration: 'OH-STL',
  ajlbSeqNo: 3,
  flightId: 'flt-1',
  description: 'Fuel increasing in the right tank',
  status: null,
  performedBy: null,
  recordedOn: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  createdBy: 'Matti1',
  ...overrides,
})

describe('KindChip', () => {
  it.each([
    ['DEFECT', 'Defect'],
    ['REMARK', 'Remark'],
    ['MAINTENANCE_NOTE', 'Maintenance note'],
  ] as const)('labels a %s', (kind, label) => {
    renderWithProviders(<KindChip kind={kind} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('StatusChip', () => {
  it.each([
    ['ACTIVE', 'Open'],
    ['MOVED_TO_HIL', 'On hold item list'],
    ['RESOLVED', 'Resolved'],
  ] as const)('labels a defect that is %s', (status, label) => {
    renderWithProviders(<StatusChip status={status} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('renders nothing for a kind with no lifecycle', () => {
    // A remark and a maintenance note both arrive with a null status, so the
    // caller drops this in unconditionally rather than repeating the check.
    const { container } = renderWithProviders(<StatusChip status={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('findingLocation', () => {
  it('names the aircraft and its logbook', () => {
    expect(findingLocation(aFinding(), 'book 3')).toBe('OH-STL · book 3')
  })

  it('names the aircraft alone when the logbook page is unknown', () => {
    // Otherwise the row ends in a dangling separator.
    expect(findingLocation(aFinding({ ajlbSeqNo: null }), 'book ')).toBe('OH-STL')
  })
})
