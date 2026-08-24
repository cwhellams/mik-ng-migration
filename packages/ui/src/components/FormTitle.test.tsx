import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { FormTitle } from './FormTitle'

describe('FormTitle', () => {
  it('renders the title as a heading', () => {
    renderWithProviders(<FormTitle title='Bank details' />)

    expect(screen.getByRole('heading', { name: 'Bank details' })).toBeInTheDocument()
  })

  it('renders no icon unless one is given', () => {
    renderWithProviders(<FormTitle title='Bank details' />)

    expect(screen.queryByTestId('icon')).toBeNull()
  })

  it('renders the icon it is given', () => {
    renderWithProviders(<FormTitle title='Bank details' icon='mdi:bank' />)

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:bank')
  })
})
