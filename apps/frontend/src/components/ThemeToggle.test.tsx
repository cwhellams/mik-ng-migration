import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import ThemeToggle from './ThemeToggle'

describe('ThemeToggle', () => {
  it('offers the night icon while the light theme is active', () => {
    renderWithProviders(<ThemeToggle />, { themeMode: 'light' })

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:weather-night')
  })

  it('offers the sun icon while the dark theme is active', () => {
    renderWithProviders(<ThemeToggle />, { themeMode: 'dark' })

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:white-balance-sunny')
  })

  it('switches theme when pressed', async () => {
    const { user } = renderWithProviders(<ThemeToggle />, { themeMode: 'light' })

    await user.click(screen.getByRole('button', { name: 'toggle theme' }))

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:white-balance-sunny')
  })

  it('remembers the choice for the next visit', async () => {
    const { user } = renderWithProviders(<ThemeToggle />, { themeMode: 'light' })

    await user.click(screen.getByRole('button', { name: 'toggle theme' }))

    expect(localStorage.getItem('themeMode')).toBe('dark')
  })

  it('is reachable by its accessible name', () => {
    renderWithProviders(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'toggle theme' })).toBeInTheDocument()
  })
})
