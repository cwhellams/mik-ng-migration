import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import { AirfieldAutocomplete } from './AirfieldAutocomplete'

/**
 * The bare airport picker `Airfields.tsx` (react-hook-form) and
 * `LiquidReportForm.tsx` (plain state) both drive. `Airfields.test.tsx`
 * already covers the react-hook-form wiring end to end; this covers the
 * picker on its own — the data fetch, and that plain onChange/value work
 * without any form underneath.
 */

const airfields = (icaos = ['EFNU', 'EFHK', 'ESSA']) =>
  server.use(
    http.get(apiUrl('v1/flight-logs/airfields'), () =>
      HttpResponse.json({ airfields: icaos.map((ident) => ({ ident, name: `${ident} airport` })) }),
    ),
  )

describe('AirfieldAutocomplete', () => {
  it('lists the airfields it fetched', async () => {
    airfields()
    const { user } = renderWithProviders(
      <AirfieldAutocomplete value='' onChange={() => {}} label='Airport' />,
    )

    await user.click(await screen.findByRole('combobox', { name: 'Airport' }))

    expect(await screen.findByText(/EFNU/)).toBeInTheDocument()
    expect(screen.getByText(/ESSA/)).toBeInTheDocument()
  })

  it('reports the chosen ident, not the whole airfield', async () => {
    airfields()
    let picked: string | undefined
    const { user } = renderWithProviders(
      <AirfieldAutocomplete
        value=''
        onChange={(ident) => {
          picked = ident
        }}
        label='Airport'
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Airport' }))
    await user.click(await screen.findByText(/ESSA/))

    expect(picked).toBe('ESSA')
  })

  it('shows the passed-in error and helper text, with no error state of its own', async () => {
    airfields()
    renderWithProviders(
      <AirfieldAutocomplete
        value=''
        onChange={() => {}}
        label='Airport'
        error
        helperText='This field is required.'
      />,
    )

    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
  })

  it('can be disabled', async () => {
    airfields()
    renderWithProviders(
      <AirfieldAutocomplete value='' onChange={() => {}} label='Airport' disabled />,
    )

    expect(await screen.findByRole('combobox', { name: 'Airport' })).toBeDisabled()
  })
})
