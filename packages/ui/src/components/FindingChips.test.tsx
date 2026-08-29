import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { KindChip, StatusChip } from './FindingChips'

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
    // A remark and a maintenance note both arrive with a null status, so
    // callers drop this in unconditionally rather than repeating the check.
    const { container } = renderWithProviders(<StatusChip status={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})
