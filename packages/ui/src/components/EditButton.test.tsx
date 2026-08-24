import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { EditButton } from './EditButton'

describe('EditButton', () => {
  it('uses its title as the accessible name', () => {
    renderWithProviders(<EditButton title='Edit member' />)

    expect(screen.getByRole('button', { name: 'Edit member' })).toBeInTheDocument()
  })

  it('defaults to the pencil icon', () => {
    renderWithProviders(<EditButton title='Edit member' />)

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:pencil')
  })

  it('takes the icon it is given', () => {
    renderWithProviders(<EditButton title='View member' icon='mdi:eye' />)

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:eye')
  })

  it('fires its click handler', async () => {
    const onClick = vi.fn()
    const { user } = renderWithProviders(<EditButton title='Edit member' onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: 'Edit member' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled, and does not fire, in view-only mode', () => {
    const onClick = vi.fn()
    renderWithProviders(<EditButton title='Edit member' onClick={onClick} viewOnly />)

    const button = screen.getByRole('button', { name: 'Edit member' })
    expect(button).toBeDisabled()

    // user-event refuses to click a disabled control at all, so drive the event
    // directly to prove the handler stays silent even then.
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders without a handler at all', () => {
    renderWithProviders(<EditButton title='Edit member' />)

    expect(screen.getByRole('button', { name: 'Edit member' })).toBeEnabled()
  })
})
