import type { Remark } from '@mik/contracts/remarks'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/renderWithProviders'
import { RemarkMarker } from './RemarkMarker'

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

describe('RemarkMarker', () => {
  it('shows the remark description', () => {
    renderWithProviders(<RemarkMarker remark={aRemark()} />)

    expect(screen.getByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
  })

  it('renders as a neutral (non-warning) chip', () => {
    renderWithProviders(<RemarkMarker remark={aRemark()} />)

    const chip = screen
      .getByText('Oil stain noticed on the ramp, wiped off')
      .closest('.MuiChip-root')
    expect(chip).not.toHaveClass('MuiChip-colorError')
    expect(chip).not.toHaveClass('MuiChip-colorWarning')
  })

  it('is not clickable -- there is nothing to change on a remark', () => {
    renderWithProviders(<RemarkMarker remark={aRemark()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
