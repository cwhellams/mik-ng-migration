import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import UserAvatar from './UserAvatar'
import { renderWithProviders } from '../test/renderWithProviders'

describe('UserAvatar', () => {
  it('shows a Gravatar for the member’s email', () => {
    renderWithProviders(<UserAvatar email='Matti.Virtanen@Example.COM ' firstName='Matti' />)

    // Gravatar hashes the email lower-cased and trimmed; the same address typed
    // with different capitalisation must resolve to the same avatar.
    const image = screen.getByRole('img')
    expect(image).toHaveAttribute(
      'src',
      expect.stringContaining('https://www.gravatar.com/avatar/'),
    )
    expect(image.getAttribute('src')).toContain('?s=40&d=404')
  })

  it('asks Gravatar for an image at the requested size', () => {
    renderWithProviders(<UserAvatar email='matti@example.com' firstName='Matti' size={96} />)

    expect(screen.getByRole('img').getAttribute('src')).toContain('?s=96')
  })

  it('falls back to initials when there is no email to hash', () => {
    renderWithProviders(<UserAvatar email='' firstName='Matti' lastName='Virtanen' />)

    expect(screen.getByText('MV')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('uses just the first initial when there is no surname', () => {
    renderWithProviders(<UserAvatar email='' firstName='matti' />)

    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('is clickable only when given a handler', async () => {
    const onClick = vi.fn()
    const { user } = renderWithProviders(
      <UserAvatar email='' firstName='Matti' onClick={onClick} />,
    )

    await user.click(screen.getByText('M'))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
