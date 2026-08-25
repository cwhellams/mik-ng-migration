import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DicebearAvatarStyle } from '@mik/contracts/members'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { AvatarStylePicker } from './AvatarStylePicker'

describe('AvatarStylePicker', () => {
  it('renders a swatch for every DiceBear style', () => {
    renderWithProviders(
      <AvatarStylePicker
        email='matti@example.com'
        firstName='Matti'
        currentStyle={DicebearAvatarStyle.INITIALS}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /initials/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /avatar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /robot/i })).toBeInTheDocument()
  })

  it('marks the current style as pressed', () => {
    renderWithProviders(
      <AvatarStylePicker
        email='matti@example.com'
        firstName='Matti'
        currentStyle={DicebearAvatarStyle.BOTTTS}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /robot/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /initials/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('calls onSelect with the clicked style', async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined)
    const { user } = renderWithProviders(
      <AvatarStylePicker
        email='matti@example.com'
        firstName='Matti'
        currentStyle={DicebearAvatarStyle.INITIALS}
        onSelect={onSelect}
      />,
    )

    await user.click(screen.getByRole('button', { name: /robot/i }))

    expect(onSelect).toHaveBeenCalledWith(DicebearAvatarStyle.BOTTTS)
  })

  it('disables the swatches while disabled is true', () => {
    renderWithProviders(
      <AvatarStylePicker
        email='matti@example.com'
        firstName='Matti'
        currentStyle={DicebearAvatarStyle.INITIALS}
        onSelect={vi.fn()}
        disabled
      />,
    )

    expect(screen.getByRole('button', { name: /initials/i })).toBeDisabled()
  })
})
