import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Remark } from '@mik/contracts/remarks'

import { renderWithProviders } from '../../../test/renderWithProviders'
import { ExistingRemarks } from './ExistingRemarks'

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

describe('ExistingRemarks', () => {
  it('renders nothing when there are no remarks', () => {
    const { container } = renderWithProviders(<ExistingRemarks remarks={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lists every remark already logged against the flight', () => {
    renderWithProviders(
      <ExistingRemarks
        remarks={[
          aRemark({ remarkId: 'remark-1', description: 'Oil stain on the ramp' }),
          aRemark({ remarkId: 'remark-2', description: 'Slight vibration on climb-out' }),
        ]}
      />,
    )

    expect(screen.getByText('Oil stain on the ramp')).toBeInTheDocument()
    expect(screen.getByText('Slight vibration on climb-out')).toBeInTheDocument()
  })
})
