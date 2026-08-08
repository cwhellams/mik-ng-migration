import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { EditDialogTitle } from './EditDialogTitle'

describe('EditDialogTitle', () => {
  it('translates the title key it is given', () => {
    renderWithProviders(<EditDialogTitle title='general.save' onClose={() => {}} />)

    // The prop is a translation key, not a literal — a detail worth pinning.
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('renders without a title', () => {
    renderWithProviders(<EditDialogTitle onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument()
  })

  it('closes when the close button is pressed', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(<EditDialogTitle title='general.save' onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
