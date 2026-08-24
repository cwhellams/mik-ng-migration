import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import AdminLayout from './AdminLayout'

/**
 * The sidebar's environment badge, next to the MIK logo — the admin app's
 * counterpart of `apps/frontend`'s `Header` badge (#1233). Both read the same
 * `VITE_API_TARGET`, so 'intra' means production in either app.
 */
describe('AdminLayout environment badge', () => {
  afterEach(() => vi.unstubAllEnvs())

  const renderLayout = () =>
    renderWithProviders(
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<div>dashboard content</div>} />
        </Route>
      </Routes>,
    )

  it('shows nothing in production', async () => {
    vi.stubEnv('VITE_API_TARGET', 'https://intra.mik.fi')

    renderLayout()

    await waitFor(() => expect(screen.getByText('dashboard content')).toBeInTheDocument())
    expect(screen.queryByText('intra')).not.toBeInTheDocument()
    expect(screen.queryByText(/beta|local/i)).not.toBeInTheDocument()
  })

  it('shows "beta" in the beta environment', async () => {
    vi.stubEnv('VITE_API_TARGET', 'https://beta.mik.fi')

    renderLayout()

    await waitFor(() => expect(screen.getByText('beta')).toBeInTheDocument())
  })

  it('shows "local" when VITE_API_TARGET is unset', async () => {
    vi.stubEnv('VITE_API_TARGET', undefined)

    renderLayout()

    await waitFor(() => expect(screen.getByText('local')).toBeInTheDocument())
  })
})
