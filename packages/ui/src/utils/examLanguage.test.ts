import { describe, expect, it } from 'vitest'

import {
  EXAM_LANGUAGES,
  getConfiguredExamLanguages,
  getPreferredExamLanguage,
  resolveExamUiLanguage,
} from './examLanguage'

describe('resolveExamUiLanguage', () => {
  it.each([
    ['fi', 'fi'],
    ['fi-FI', 'fi'],
    ['sv', 'sv'],
    ['en-GB', 'en'],
    ['de', 'en'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveExamUiLanguage(input)).toBe(expected)
  })
})

describe('getConfiguredExamLanguages', () => {
  it('returns the version’s supported languages', () => {
    expect(getConfiguredExamLanguages({ supportedLanguages: ['fi', 'sv'] })).toEqual(['fi', 'sv'])
  })

  it('drops languages the UI does not know about', () => {
    expect(getConfiguredExamLanguages({ supportedLanguages: ['fi', 'de', 'sv'] })).toEqual([
      'fi',
      'sv',
    ])
  })

  it('adds the default language and any language that actually has content', () => {
    expect(
      getConfiguredExamLanguages({ supportedLanguages: ['fi'], defaultLanguage: 'en' }, ['sv']),
    ).toEqual(['fi', 'en', 'sv'])
  })

  it('de-duplicates across the configured, default and available lists', () => {
    expect(
      getConfiguredExamLanguages({ supportedLanguages: ['fi', 'en'], defaultLanguage: 'en' }, [
        'fi',
        'en',
      ]),
    ).toEqual(['fi', 'en'])
  })

  it('returns nothing when the version is unconfigured and has no content', () => {
    expect(getConfiguredExamLanguages({})).toEqual([])
  })

  it('recovers the language list from available content alone', () => {
    expect(getConfiguredExamLanguages({}, ['sv'])).toEqual(['sv'])
  })
})

describe('getPreferredExamLanguage', () => {
  it('picks the reader’s own language when the exam offers it', () => {
    expect(getPreferredExamLanguage('fi-FI', { supportedLanguages: ['en', 'fi'] })).toBe('fi')
  })

  it('falls back to English before the exam’s default language', () => {
    expect(
      getPreferredExamLanguage('de', { supportedLanguages: ['sv', 'en'], defaultLanguage: 'sv' }),
    ).toBe('en')
  })

  it('falls back to the exam’s default language when English is not offered', () => {
    expect(
      getPreferredExamLanguage('de', { supportedLanguages: ['fi', 'sv'], defaultLanguage: 'sv' }),
    ).toBe('sv')
  })

  it('falls back to the first configured language when nothing else matches', () => {
    expect(getPreferredExamLanguage('de', { supportedLanguages: ['fi', 'sv'] })).toBe('fi')
  })

  it('returns undefined when the exam has no usable language at all', () => {
    expect(getPreferredExamLanguage('fi', {})).toBeUndefined()
    expect(getPreferredExamLanguage('fi', { supportedLanguages: ['de'] })).toBeUndefined()
  })

  it('treats the default language as offered even when supportedLanguages omits it', () => {
    expect(
      getPreferredExamLanguage('de', { supportedLanguages: ['fi'], defaultLanguage: 'sv' }),
    ).toBe('sv')
  })
})

describe('EXAM_LANGUAGES', () => {
  it('lists exactly the three languages the app ships translations for', () => {
    expect(EXAM_LANGUAGES).toEqual(['en', 'fi', 'sv'])
  })
})
