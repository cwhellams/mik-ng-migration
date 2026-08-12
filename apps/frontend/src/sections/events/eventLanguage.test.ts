import type { ClubEvent } from '@mik/contracts/events'
import { describe, expect, it } from 'vitest'

import { getEventDisplayText, resolveEventUiLanguage } from './eventLanguage'

const anEvent = (overrides: Partial<ClubEvent> = {}): ClubEvent => ({
  eventId: '0195c1a0-0000-4000-8000-000000000001',
  title: 'Spring fly-in',
  description: 'Coffee and pancakes at EFNU.',
  location: 'EFNU',
  imageUrl: null,
  performer: null,
  translations: {
    fi: { title: 'Kevätlentopäivä', description: 'Kahvia ja lettuja Nummelassa.' },
    sv: { title: 'Vårflygdag', description: null },
  },
  startTime: '2025-06-02T09:00:00Z',
  endTime: '2025-06-02T15:00:00Z',
  isPublic: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: 'k1mnimda',
  updatedAt: '2025-01-01T00:00:00.000Z',
  updatedBy: 'k1mnimda',
  ...overrides,
})

describe('resolveEventUiLanguage', () => {
  it.each([
    ['fi', 'fi'],
    ['fi-FI', 'fi'],
    ['sv', 'sv'],
    ['sv-SE', 'sv'],
    ['en-GB', 'en'],
    ['de', 'en'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveEventUiLanguage(input)).toBe(expected)
  })
})

describe('getEventDisplayText', () => {
  it('returns the translation for a translated language', () => {
    expect(getEventDisplayText(anEvent(), 'fi')).toEqual({
      title: 'Kevätlentopäivä',
      description: 'Kahvia ja lettuja Nummelassa.',
    })
  })

  it('returns the base columns for English rather than looking for a translation', () => {
    expect(getEventDisplayText(anEvent(), 'en')).toEqual({
      title: 'Spring fly-in',
      description: 'Coffee and pancakes at EFNU.',
    })
  })

  it('falls back to the base columns when the language has no translation', () => {
    const event = anEvent({ translations: {} })

    expect(getEventDisplayText(event, 'fi')).toEqual({
      title: 'Spring fly-in',
      description: 'Coffee and pancakes at EFNU.',
    })
  })

  it('keeps a translation whose description is null, rather than falling back for it', () => {
    // The translation row wins as a unit — a Swedish title with no Swedish
    // description does not borrow the English description.
    expect(getEventDisplayText(anEvent(), 'sv')).toEqual({
      title: 'Vårflygdag',
      description: null,
    })
  })

  it('falls back to English for an unsupported language', () => {
    expect(getEventDisplayText(anEvent(), 'de').title).toBe('Spring fly-in')
  })
})
