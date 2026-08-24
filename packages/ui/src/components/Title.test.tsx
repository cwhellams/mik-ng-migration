import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { Title } from './Title'

describe('Title', () => {
  it('renders the label as a top-level page heading', () => {
    renderWithProviders(<Title label='Members' />)

    // Desktop (matchMedia reports no match in tests) uses h2 for a page title.
    expect(screen.getByRole('heading', { level: 2, name: 'Members' })).toBeInTheDocument()
  })

  it('drops to a smaller heading for a subtitle', () => {
    renderWithProviders(<Title label='Bank details' subtitle />)

    expect(screen.getByRole('heading', { level: 5, name: 'Bank details' })).toBeInTheDocument()
  })

  it('renders actions passed as children next to the title', () => {
    renderWithProviders(
      <Title label='Members'>
        <button>Add member</button>
      </Title>,
    )

    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument()
  })
})
