import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { RemoveButton } from './RemoveButton'

describe('RemoveButton', () => {
  it('is labelled Delete and carries the bin icon', () => {
    renderWithProviders(<RemoveButton />)

    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:delete')
  })

  it('is not a submit button — deleting should never be the form default', () => {
    renderWithProviders(<RemoveButton />)

    expect(screen.getByRole('button', { name: /Delete/ })).not.toHaveAttribute('type', 'submit')
  })

  it('fires its click handler', async () => {
    const onClick = vi.fn()
    const { user } = renderWithProviders(<RemoveButton onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: /Delete/ }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('can be disabled', () => {
    renderWithProviders(<RemoveButton disabled />)

    expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled()
  })
})
