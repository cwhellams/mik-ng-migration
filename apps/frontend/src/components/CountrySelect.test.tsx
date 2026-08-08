import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { CountrySelect } from './CountrySelect'

const renderSelect = (props: Partial<Parameters<typeof CountrySelect>[0]> = {}) => {
  const onChange = vi.fn()
  const rendered = renderWithProviders(<CountrySelect value='FI' onChange={onChange} {...props} />)
  return { ...rendered, onChange }
}

describe('CountrySelect', () => {
  it('labels itself Country by default', () => {
    renderSelect()

    expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument()
  })

  it('takes a custom label', () => {
    renderSelect({ label: 'Nationality' })

    expect(screen.getByRole('combobox', { name: 'Nationality' })).toBeInTheDocument()
  })

  it('shows the selected country by name, not by code', () => {
    renderSelect({ value: 'FI' })

    expect(screen.getByRole('combobox')).toHaveValue('Finland')
  })

  it('shows nothing selected for an unknown code', () => {
    renderSelect({ value: 'ZZ' })

    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('shows nothing selected when the value is empty', () => {
    renderSelect({ value: null })

    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('reports the code of the country the user picks', async () => {
    const { user, onChange } = renderSelect({ value: null })

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'Sweden')
    await user.click(await screen.findByText('Sweden'))

    expect(onChange).toHaveBeenCalledWith('SE')
  })

  it('reports an empty code when the selection is cleared', async () => {
    const { user, onChange } = renderSelect({ value: 'FI' })

    // MUI only puts the clear button in the accessibility tree once focused.
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('hides the clear button when a country is required', async () => {
    const { user } = renderSelect({ value: 'FI', required: true })

    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(screen.getByRole('combobox')).toBeRequired()
  })
})
