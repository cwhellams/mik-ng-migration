import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export type UiLanguage = 'en' | 'fi' | 'sv'

/** Maps an i18next language tag (e.g. `fi-FI`) to one of the three UI languages. */
export function resolveLanguage(language: string): UiLanguage {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

/**
 * Picks the current-language string out of a `{en, fi, sv}` record. The one
 * agreed fallback chain for localised text across the app: requested language,
 * then English, then an empty string — never the raw entity id or a dash. A
 * caller that wants a different final fallback (e.g. the id, for a table cell
 * that must never be blank) can still layer `localText(value, lang) || id`.
 */
export function localText(
  value: Partial<Record<UiLanguage, string>> | undefined | null,
  lang: UiLanguage,
): string {
  if (!value) return ''
  return value[lang] ?? value.en ?? ''
}

/** Current UI language plus a `localise` shorthand bound to it. */
export const useLocalisedText = () => {
  const { i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)
  return useMemo(
    () => ({
      lang,
      localise: (value: Partial<Record<UiLanguage, string>> | undefined | null) =>
        localText(value, lang),
    }),
    [lang],
  )
}
