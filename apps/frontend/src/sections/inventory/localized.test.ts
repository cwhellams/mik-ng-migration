import { describe, expect, it } from 'vitest'

import { conditionColor, localName, resolveLanguage } from './localized'

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

  it('is case sensitive — an uppercase tag falls through to English', () => {
    // i18next always hands us lowercase tags, so this documents the boundary
    // rather than endorsing it.
    expect(resolveLanguage('FI')).toBe('en')
  })
})

describe('localName', () => {
  const names = { fi: 'Ruuvimeisseli', sv: 'Skruvmejsel', en: 'Screwdriver' }

  it('returns the name in the requested language', () => {
    expect(localName(names, 'fi')).toBe('Ruuvimeisseli')
    expect(localName(names, 'sv')).toBe('Skruvmejsel')
    expect(localName(names, 'en')).toBe('Screwdriver')
  })

  it('falls back to English when the language is missing', () => {
    expect(localName({ en: 'Screwdriver' }, 'fi')).toBe('Screwdriver')
  })

  it('returns an empty string when neither the language nor English is present', () => {
    expect(localName({ de: 'Schraubendreher' }, 'fi')).toBe('')
  })

  it('returns an empty string for a missing object', () => {
    expect(localName(undefined, 'fi')).toBe('')
  })
})

describe('conditionColor', () => {
  it.each([
    ['GOOD', 'success'],
    ['FAIR', 'warning'],
    ['POOR', 'error'],
  ])('maps %s to %s', (condition, expected) => {
    expect(conditionColor(condition)).toBe(expected)
  })

  it('falls back to the default colour for an unknown condition', () => {
    expect(conditionColor('BROKEN')).toBe('default')
    expect(conditionColor('')).toBe('default')
  })
})
