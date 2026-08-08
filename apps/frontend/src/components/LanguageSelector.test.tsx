import { MIKLang } from '@backend/routes/members/models'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import LanguageSelector from './LanguageSelector'

const renderSelector = (props: Partial<Parameters<typeof LanguageSelector>[0]> = {}) => {
  const onLanguageChange = vi.fn()
  const rendered = renderWithProviders(
    <LanguageSelector
      selectedLanguage={MIKLang.EN}
      onLanguageChange={onLanguageChange}
      {...props}
    />,
  )
  return { ...rendered, onLanguageChange }
}

describe('LanguageSelector', () => {
  it.each([
    [MIKLang.EN, 'circle-flags:uk'],
    [MIKLang.FI, 'circle-flags:fi'],
    [MIKLang.SV, 'circle-flags:se'],
  ])('shows the %s flag on the trigger', (language, flag) => {
    renderSelector({ selectedLanguage: language })

    expect(screen.getAllByTestId('icon')[0]).toHaveAttribute('data-icon', flag)
  })

  it('shows only the flag by default', () => {
    renderSelector()

    expect(screen.queryByText('English')).toBeNull()
  })

  it('shows the language name when asked', () => {
    renderSelector({ showLabel: true })

    expect(screen.getByText('English')).toBeInTheDocument()
  })

  it('keeps the menu closed until pressed', () => {
    renderSelector()

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('offers all three languages once opened', async () => {
    const { user } = renderSelector()

    await user.click(screen.getByRole('button'))

    expect(await screen.findByRole('menuitem', { name: /English/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Suomi/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Svenska/ })).toBeInTheDocument()
  })

  it('reports the language the user picked', async () => {
    const { user, onLanguageChange } = renderSelector()

    await user.click(screen.getByRole('button'))
    await user.click(await screen.findByRole('menuitem', { name: /Suomi/ }))

    expect(onLanguageChange).toHaveBeenCalledWith(MIKLang.FI)
  })

  it('closes the menu after a choice', async () => {
    const { user } = renderSelector()

    await user.click(screen.getByRole('button'))
    await user.click(await screen.findByRole('menuitem', { name: /Suomi/ }))

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('closes on Escape without reporting a change', async () => {
    const { user, onLanguageChange } = renderSelector()

    await user.click(screen.getByRole('button'))
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onLanguageChange).not.toHaveBeenCalled()
  })
})
