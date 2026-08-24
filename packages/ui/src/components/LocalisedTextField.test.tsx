import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { LocalisedTextField } from './LocalisedTextField'

describe('LocalisedTextField', () => {
  it('renders one field per language, defaulting to en/fi/sv', () => {
    renderWithProviders(
      <LocalisedTextField
        label='Name'
        values={{ en: 'Hello', fi: 'Hei', sv: 'Hej' }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Name (EN)' })).toHaveValue('Hello')
    expect(screen.getByRole('textbox', { name: 'Name (FI)' })).toHaveValue('Hei')
    expect(screen.getByRole('textbox', { name: 'Name (SV)' })).toHaveValue('Hej')
  })

  it('shows the label, marking it required', () => {
    renderWithProviders(<LocalisedTextField label='Name' values={{}} onChange={vi.fn()} required />)

    expect(screen.getByText('Name *')).toBeInTheDocument()
  })

  it('calls onChange with the edited language and new value', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <LocalisedTextField label='Name' values={{ en: '' }} onChange={onChange} />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Name (EN)' }), 'x')

    expect(onChange).toHaveBeenCalledWith('en', 'x')
  })

  it('restricts to a given subset of languages', () => {
    renderWithProviders(
      <LocalisedTextField label='Name' values={{}} onChange={vi.fn()} languages={['en', 'fi']} />,
    )

    expect(screen.getByRole('textbox', { name: 'Name (EN)' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name (FI)' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name (SV)' })).not.toBeInTheDocument()
  })

  it('treats a missing value as an empty field rather than throwing', () => {
    renderWithProviders(
      <LocalisedTextField label='Name' values={{ en: 'Hello' }} onChange={vi.fn()} />,
    )

    expect(screen.getByRole('textbox', { name: 'Name (FI)' })).toHaveValue('')
  })

  it('shows a group-level helper text when marked in error', () => {
    renderWithProviders(
      <LocalisedTextField
        label='Name'
        values={{}}
        onChange={vi.fn()}
        error
        helperText='This field is required'
      />,
    )

    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('shows no helper text when not in error', () => {
    renderWithProviders(
      <LocalisedTextField label='Name' values={{}} onChange={vi.fn()} helperText='Unused' />,
    )

    expect(screen.queryByText('Unused')).not.toBeInTheDocument()
  })
})
