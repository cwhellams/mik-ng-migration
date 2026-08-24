import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { SaveButton } from './SaveButton'

describe('SaveButton', () => {
  it('is a submit button, so Enter in a form saves', () => {
    renderWithProviders(<SaveButton />)

    expect(screen.getByRole('button', { name: /Save/ })).toHaveAttribute('type', 'submit')
  })

  it('is labelled in the active language', () => {
    renderWithProviders(<SaveButton />)

    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:content-save')
  })

  it('can be disabled', () => {
    renderWithProviders(<SaveButton disabled />)

    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
  })

  it('fires its click handler', async () => {
    const onClick = vi.fn()
    const { user } = renderWithProviders(<SaveButton onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: /Save/ }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('lets a caller override the button type', () => {
    renderWithProviders(<SaveButton type='button' />)

    expect(screen.getByRole('button', { name: /Save/ })).toHaveAttribute('type', 'button')
  })
})
