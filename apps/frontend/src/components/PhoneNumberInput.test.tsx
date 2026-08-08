import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { PhoneNumberInput } from './PhoneNumberInput'

const renderInput = (props: Partial<Parameters<typeof PhoneNumberInput>[0]> = {}) => {
  const onChange = vi.fn()
  const onCountryCodeChange = vi.fn()
  const rendered = renderWithProviders(
    <PhoneNumberInput
      value=''
      onChange={onChange}
      onCountryCodeChange={onCountryCodeChange}
      label='Phone number'
      {...props}
    />,
  )
  return { ...rendered, onChange, onCountryCodeChange }
}

const numberField = () => screen.getByRole('textbox', { name: /Phone number/ })
const codeField = () => screen.getByRole('combobox', { name: 'Code' })

describe('PhoneNumberInput display', () => {
  it('defaults to the Finnish dial code for an empty number', () => {
    renderInput()

    expect(codeField()).toHaveValue('+358')
    expect(numberField()).toHaveValue('')
  })

  it('splits a stored number into its dial code and local part', () => {
    renderInput({ value: '+358401234567' })

    expect(codeField()).toHaveValue('+358')
    expect(numberField()).toHaveValue('40 1234 567')
  })

  it('prefers the stored country over guessing from the dial code', () => {
    // +44 is shared by the UK, Guernsey, Isle of Man and Jersey, which format
    // differently — the stored country is what disambiguates them.
    renderInput({ value: '+447911123456', countryCode: 'JE' })

    expect(codeField()).toHaveValue('+44')
    expect(numberField()).toHaveValue('791 112 345 6')
  })

  it('guesses from the dial code when no country was stored', () => {
    renderInput({ value: '+447911123456' })

    expect(codeField()).toHaveValue('+44')
    expect(numberField()).toHaveValue('7911 123456')
  })

  it('ignores a stored country that does not match the number', () => {
    renderInput({ value: '+358401234567', countryCode: 'GB' })

    expect(codeField()).toHaveValue('+358')
  })

  it('treats a legacy number with no dial code as Finnish, dropping the trunk zero', () => {
    renderInput({ value: '0401234567' })

    expect(codeField()).toHaveValue('+358')
    expect(numberField()).toHaveValue('40 1234 567')
  })

  it('keeps the stored country when the number is cleared', () => {
    renderInput({ value: '', countryCode: 'SE' })

    expect(codeField()).toHaveValue('+46')
  })

  it('re-splits when the value changes underneath it', () => {
    const { rerender } = renderInput({ value: '+358401234567' })
    expect(numberField()).toHaveValue('40 1234 567')

    rerender(<PhoneNumberInput value='+46701234567' onChange={() => {}} label='Phone number' />)

    expect(codeField()).toHaveValue('+46')
  })
})

describe('PhoneNumberInput editing', () => {
  it('emits the dial code joined to what was typed', async () => {
    const { user, onChange } = renderInput()

    await user.type(numberField(), '401234567')

    expect(onChange).toHaveBeenLastCalledWith('+358401234567')
  })

  it('strips everything that is not a digit', async () => {
    const { user, onChange } = renderInput()

    await user.type(numberField(), '40-123 45(67)')

    expect(onChange).toHaveBeenLastCalledWith('+358401234567')
  })

  it('drops a leading trunk zero, which the dial code replaces', async () => {
    const { user, onChange } = renderInput()

    await user.type(numberField(), '0401234567')

    expect(onChange).toHaveBeenLastCalledWith('+358401234567')
  })

  it('emits an empty value rather than a bare dial code when cleared', async () => {
    const { user, onChange } = renderInput({ value: '+358401234567' })

    await user.clear(numberField())

    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('re-emits the number under the new dial code when the country changes', async () => {
    const { user, onChange, onCountryCodeChange } = renderInput({ value: '+358401234567' })

    await user.click(codeField())
    await user.clear(codeField())
    await user.type(codeField(), 'Sweden')
    await user.click(await screen.findByText('Sweden'))

    expect(onCountryCodeChange).toHaveBeenCalledWith('SE')
    expect(onChange).toHaveBeenLastCalledWith('+46401234567')
  })

  it('emits nothing but an empty value when the country changes with no number', async () => {
    const { user, onChange } = renderInput({ value: '' })

    await user.click(codeField())
    await user.clear(codeField())
    await user.type(codeField(), 'Sweden')
    await user.click(await screen.findByText('Sweden'))

    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('can search the country list by name', async () => {
    const { user } = renderInput()

    await user.click(codeField())
    await user.clear(codeField())
    await user.type(codeField(), 'Norway')

    const options = await screen.findAllByRole('option')
    expect(options.some((option) => option.textContent?.includes('Norway'))).toBe(true)
    expect(options.some((option) => option.textContent?.includes('Finland'))).toBe(false)
  })

  it('surfaces a validation error from the caller', () => {
    renderInput({ error: true, helperText: 'Phone number is required' })

    expect(screen.getByText('Phone number is required')).toBeInTheDocument()
  })

  it('marks the number as required when asked', () => {
    renderInput({ required: true })

    expect(numberField()).toBeRequired()
  })
})
