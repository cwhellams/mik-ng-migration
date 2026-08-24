import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { FormField } from './FormField'

describe('FormField', () => {
  it('renders the label with a trailing colon', () => {
    renderWithProviders(<FormField label='Licence' />)

    expect(screen.getByText('Licence:')).toBeInTheDocument()
  })

  it('renders its value alongside the label', () => {
    renderWithProviders(
      <FormField label='Licence'>
        <span>FI.FCL.123456</span>
      </FormField>,
    )

    expect(screen.getByText('FI.FCL.123456')).toBeInTheDocument()
  })

  it('renders no icon unless one is given', () => {
    renderWithProviders(<FormField label='Licence' />)

    expect(screen.queryByTestId('icon')).toBeNull()
  })

  it('renders the icon it is given', () => {
    renderWithProviders(<FormField label='Licence' icon='mdi:card-account-details' />)

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:card-account-details')
  })

  it('renders without children', () => {
    renderWithProviders(<FormField label='Licence' />)

    expect(screen.getByText('Licence:')).toBeInTheDocument()
  })
})
