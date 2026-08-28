import { describe, expect, it } from '@jest/globals'
import { localisedText } from '../../src/lib/localisedText.ts'

// The backend's one resolver for an `{en, fi, sv}` record that arrived as
// untyped JSON. It is shared on purpose: the shop order emails and the
// SimplBooks invoice lines read the same `productSnapshot.name`, and before
// #1289's review they each had their own version with a different fallback
// order, so one product could be named two things in the same purchase.

describe('localisedText', () => {
  it('prefers the requested language', () => {
    expect(localisedText({ en: 'Cap', fi: 'Lippalakki', sv: 'Keps' }, 'fi')).toBe('Lippalakki')
  })

  it('falls back to English when the requested language is missing', () => {
    expect(localisedText({ en: 'Cap' }, 'sv')).toBe('Cap')
  })

  it('falls back to any language that has text rather than rendering blank', () => {
    expect(localisedText({ en: '', fi: '', sv: 'Keps' }, 'fi')).toBe('Keps')
  })

  it('trims the value it picks', () => {
    expect(localisedText({ fi: '  Lippalakki  ' }, 'fi')).toBe('Lippalakki')
  })

  it('serves the invoice lines’ Finnish-first order when asked for it', () => {
    // What `extractLocalizedName` in simplbooksOutboxHandler.ts used to do on
    // its own: fi, then en, then whatever else has text.
    expect(localisedText({ en: 'Cap', fi: 'Lippalakki', sv: 'Keps' }, 'fi')).toBe('Lippalakki')
    expect(localisedText({ en: 'Cap', sv: 'Keps' }, 'fi')).toBe('Cap')
    expect(localisedText({ sv: 'Keps' }, 'fi')).toBe('Keps')
  })

  it.each([[null], [undefined], ['not an object'], [{}], [{ en: 42 }]])(
    'returns an empty string for %p',
    (value) => {
      expect(localisedText(value, 'en')).toBe('')
    },
  )
})
