import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DicebearAvatarStyle } from '@mik/contracts/members'
import UserAvatar, { getDicebearAvatar } from './UserAvatar'
import { renderWithProviders } from '../test/renderWithProviders'

describe('UserAvatar', () => {
  it('generates a deterministic DiceBear avatar from the email, not a third-party Gravatar fetch', () => {
    renderWithProviders(<UserAvatar email='Matti.Virtanen@Example.COM ' firstName='Matti' />)

    const image = screen.getByRole('img')
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(image.getAttribute('src')).not.toContain('gravatar.com')
  })

  it('renders the same DiceBear avatar for the same email regardless of case/whitespace', () => {
    renderWithProviders(<UserAvatar email='Matti.Virtanen@Example.COM ' firstName='Matti' />)
    const first = screen.getByRole('img').getAttribute('src')

    renderWithProviders(<UserAvatar email='matti.virtanen@example.com' firstName='Matti' />)
    const all = screen.getAllByRole('img')
    expect(all[all.length - 1].getAttribute('src')).toBe(first)
  })

  it('prefers an uploaded avatarUrl over the DiceBear fallback', () => {
    renderWithProviders(
      <UserAvatar
        email='matti@example.com'
        firstName='Matti'
        avatarUrl='https://spaces.example.com/member-avatars/abc.jpg'
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://spaces.example.com/member-avatars/abc.jpg',
    )
  })

  it('falls back to DiceBear if the uploaded avatarUrl fails to load', () => {
    renderWithProviders(
      <UserAvatar
        email='matti@example.com'
        firstName='Matti'
        avatarUrl='https://broken/avatar.jpg'
      />,
    )

    fireEvent.error(screen.getByRole('img'))

    expect(screen.getByRole('img').getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('recovers to a freshly presigned avatarUrl after a previous one failed to load (regression: uploadFailed was a permanent latch)', () => {
    const { rerender } = renderWithProviders(
      <UserAvatar
        email='matti@example.com'
        firstName='Matti'
        avatarUrl='https://spaces.example.com/expired.jpg?expires=1'
      />,
    )

    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('img').getAttribute('src')).toMatch(/^data:image\/svg\+xml/)

    // A member read re-presigns the URL on every fetch, so a later render normally
    // carries a different (fresh) avatarUrl even though it's the same underlying photo.
    rerender(
      <UserAvatar
        email='matti@example.com'
        firstName='Matti'
        avatarUrl='https://spaces.example.com/fresh.jpg?expires=2'
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://spaces.example.com/fresh.jpg?expires=2',
    )
  })

  it('defaults to the initials style when avatarStyle is not given', () => {
    renderWithProviders(<UserAvatar email='matti@example.com' firstName='Matti' />)

    expect(screen.getByRole('img').getAttribute('src')).toBe(
      getDicebearAvatar('matti@example.com', 'Matti', undefined, DicebearAvatarStyle.INITIALS),
    )
  })

  it.each([DicebearAvatarStyle.AVATAAARS, DicebearAvatarStyle.BOTTTS])(
    'renders the %s DiceBear style, distinct from initials, when avatarStyle is set',
    (style) => {
      renderWithProviders(
        <UserAvatar email='matti@example.com' firstName='Matti' avatarStyle={style} />,
      )

      const src = screen.getByRole('img').getAttribute('src')
      expect(src).toBe(getDicebearAvatar('matti@example.com', 'Matti', undefined, style))
      expect(src).not.toBe(
        getDicebearAvatar('matti@example.com', 'Matti', undefined, DicebearAvatarStyle.INITIALS),
      )
    },
  )

  it('forwards className to the underlying Avatar', () => {
    renderWithProviders(
      <UserAvatar email='matti@example.com' firstName='Matti' className='user-avatar' />,
    )

    expect(screen.getByRole('img').closest('.user-avatar')).toBeInTheDocument()
  })

  it('is clickable only when given a handler', async () => {
    const onClick = vi.fn()
    const { user } = renderWithProviders(
      <UserAvatar email='matti@example.com' firstName='Matti' onClick={onClick} />,
    )

    await user.click(screen.getByRole('img'))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
