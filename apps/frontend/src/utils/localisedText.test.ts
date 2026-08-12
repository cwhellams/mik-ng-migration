import { describe, expect, it } from 'vitest'

import { renderHookWithProviders } from '../test/renderWithProviders'
import { localText, resolveLanguage, useLocalisedText } from './localisedText'

describe('resolveLanguage', () => {
  it.each([
    ['fi', 'fi'],
    ['fi-FI', 'fi'],
    ['sv', 'sv'],
    ['sv-SE', 'sv'],
    ['en', 'en'],
    ['en-GB', 'en'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveLanguage(input)).toBe(expected)
  })

  it('falls back to English for anything else', () => {
    expect(resolveLanguage('de')).toBe('en')
    expect(resolveLanguage('')).toBe('en')
  })
})

describe('localText', () => {
  const names = { fi: 'Ruuvimeisseli', sv: 'Skruvmejsel', en: 'Screwdriver' }

  it('returns the text in the requested language', () => {
    expect(localText(names, 'fi')).toBe('Ruuvimeisseli')
    expect(localText(names, 'sv')).toBe('Skruvmejsel')
    expect(localText(names, 'en')).toBe('Screwdriver')
  })

  it('falls back to English when the language is missing', () => {
    expect(localText({ en: 'Screwdriver' }, 'fi')).toBe('Screwdriver')
  })

  it('returns an empty string when neither the language nor English is present', () => {
    expect(localText({ sv: 'Skruvmejsel' }, 'fi')).toBe('')
  })

  it('returns an empty string for a missing value', () => {
    expect(localText(undefined, 'fi')).toBe('')
    expect(localText(null, 'fi')).toBe('')
  })
})

describe('useLocalisedText', () => {
  it('resolves the current i18n language', () => {
    const { result } = renderHookWithProviders(() => useLocalisedText(), { language: 'fi' })

    expect(result.current.lang).toBe('fi')
  })

  it('localise() reads the current-language value', () => {
    const { result } = renderHookWithProviders(() => useLocalisedText(), { language: 'sv' })

    expect(result.current.localise({ en: 'Screwdriver', sv: 'Skruvmejsel' })).toBe('Skruvmejsel')
  })
})
