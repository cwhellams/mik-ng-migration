import type { ClubEvent } from '@mik/contracts/events'

export function resolveEventUiLanguage(language: string): 'fi' | 'sv' | 'en' {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

// English (the event's base title/description) is always present, so it's
// the only fallback needed when no translation exists for the given language.
export function getEventDisplayText(
  event: ClubEvent,
  language: string,
): { title: string; description: string | null } {
  const lang = resolveEventUiLanguage(language)
  const translation = lang === 'en' ? undefined : event.translations[lang]
  return translation ?? { title: event.title, description: event.description }
}
