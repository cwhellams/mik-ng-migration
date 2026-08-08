import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import Footer from './Footer'

const version = (value: string) =>
  server.use(http.get(apiUrl('v1/version'), () => HttpResponse.json({ version: value })))

describe('Footer', () => {
  it('links out to the club site and contact page', async () => {
    version('1.2.3')

    renderWithProviders(<Footer />)

    expect(await screen.findByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      'https://www.mik.fi',
    )
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      'https://www.mik.fi/contact',
    )
  })

  it('opens the privacy policy', async () => {
    version('1.2.3')

    const { user } = renderWithProviders(<Footer />)

    // Rendered as a button, not an anchor — it opens a dialog rather than navigating.
    await user.click(await screen.findByRole('button', { name: 'Privacy' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('shows the running version', async () => {
    version('1.2.3')

    renderWithProviders(<Footer />)

    expect(await screen.findByText(/Version 1\.2\.3/)).toBeInTheDocument()
  })

  it('shows no version line when the endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/version'), () => problemResponse(500, 'Down')))

    renderWithProviders(<Footer />)

    await waitFor(() => expect(screen.queryByText(/Version/)).toBeNull())
  })

  it('shows the current year', async () => {
    version('1.2.3')
    const year = new Date().getFullYear()

    renderWithProviders(<Footer />)

    expect(await screen.findByText(new RegExp(String(year)))).toBeInTheDocument()
  })

  it('renders for a signed-out visitor', async () => {
    // The footer sits on the login page too, so it must not require a session.
    version('1.2.3')
    server.use(http.get(apiUrl('v1/members/me'), () => problemResponse(401, 'Unauthorized')))

    renderWithProviders(<Footer />)

    expect(await screen.findByRole('link', { name: 'Website' })).toBeInTheDocument()
  })
})
