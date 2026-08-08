import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import SplashScreen from './SplashScreen'

describe('SplashScreen', () => {
  it('shows the club logo', () => {
    renderWithProviders(<SplashScreen />)

    expect(screen.getByRole('img', { name: 'MIK Logo' })).toBeInTheDocument()
  })

  it('is opaque while loading', () => {
    const { container } = renderWithProviders(<SplashScreen loading />)

    expect(container.firstElementChild).toHaveStyle({ opacity: '1' })
  })

  it('fades out and stops swallowing clicks once loaded', () => {
    // It stays mounted rather than unmounting, so it must not block the app.
    const { container } = renderWithProviders(<SplashScreen loading={false} />)

    expect(container.firstElementChild).toHaveStyle({
      opacity: '0',
      pointerEvents: 'none',
    })
  })

  it('defaults to loading', () => {
    const { container } = renderWithProviders(<SplashScreen />)

    expect(container.firstElementChild).toHaveStyle({ opacity: '1' })
  })
})
