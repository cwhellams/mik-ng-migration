import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useForm, type Control } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import { Airfields } from './Airfields'

interface Form {
  departureAirport: string
}

const airfields = (icaos = ['EFNU', 'EFHK', 'ESSA']) =>
  server.use(
    http.get(apiUrl('v1/flight-logs/airfields'), () =>
      HttpResponse.json({ airfields: icaos.map((ident) => ({ ident, name: `${ident} airport` })) }),
    ),
  )

/** Hosts the field in a real form so it behaves as it does in the flight log. */
const Host = ({
  defaultValue = '',
  required,
  disabled,
  onReady,
}: {
  defaultValue?: string
  required?: boolean
  disabled?: boolean
  onReady?: (control: Control<Form>, submit: () => void) => void
}) => {
  const form = useForm<Form>({ defaultValues: { departureAirport: defaultValue } })
  onReady?.(
    form.control,
    form.handleSubmit(() => {}),
  )
  return (
    <form onSubmit={form.handleSubmit(() => {})}>
      <Airfields
        control={form.control}
        name='departureAirport'
        label='Departure'
        required={required}
        disabled={disabled}
      />
      <button type='submit'>Save</button>
    </form>
  )
}

describe('Airfields', () => {
  it('lists the airfields it fetched', async () => {
    airfields()
    const { user } = renderWithProviders(<Host />)

    await user.click(screen.getByRole('combobox', { name: /Departure/ }))

    expect(await screen.findByText(/EFNU/)).toBeInTheDocument()
    expect(screen.getByText(/ESSA/)).toBeInTheDocument()
  })

  it('shows the value the form already holds, once the list arrives', async () => {
    airfields()
    renderWithProviders(<Host defaultValue='EFNU' />)

    // The stored value is an ICAO code, but the picker matches it against the
    // fetched list — so the field reads blank until that list lands.
    expect(screen.getByRole('combobox', { name: /Departure/ })).toHaveValue('')

    // The picker shows the ICAO code and the airfield name together.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Departure/ })).toHaveValue('EFNU: EFNU airport'),
    )
  })

  it('writes the chosen airfield back into the form', async () => {
    airfields()
    const { user } = renderWithProviders(<Host />)

    const field = screen.getByRole('combobox', { name: /Departure/ })
    await user.click(field)
    await user.click(await screen.findByText(/ESSA/))

    expect(field).toHaveValue('ESSA: ESSA airport')
  })

  it('can be disabled', () => {
    airfields()
    renderWithProviders(<Host disabled />)

    expect(screen.getByRole('combobox', { name: /Departure/ })).toBeDisabled()
  })

  it('marks itself required', () => {
    airfields()
    renderWithProviders(<Host required />)

    expect(screen.getByRole('combobox', { name: /Departure/ })).toBeRequired()
  })

  it('still renders when the airfield list cannot be loaded', async () => {
    server.use(http.get(apiUrl('v1/flight-logs/airfields'), () => problemResponse(500, 'Down')))

    renderWithProviders(<Host />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Departure/ })).toBeInTheDocument(),
    )
  })

  it('stays quiet about a missing value until the user tries to save', async () => {
    // The flight log validates the whole form on every change, so an untouched
    // required field must not go red before the first save attempt.
    airfields()
    const { user } = renderWithProviders(<Host required />)

    expect(screen.queryByText(/required/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('combobox', { name: /Departure/ })).toBeInTheDocument()
  })
})
