// Shared helpers for the inventory pages (list, detail and admin) so the
// language resolution, localised-name lookup and condition-colour mapping live
// in one place instead of being copy-pasted into every component.

export type UiLanguage = 'fi' | 'sv' | 'en'

export function resolveLanguage(language: string): UiLanguage {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

export function localName(obj: Record<string, string> | undefined, lang: UiLanguage): string {
  if (!obj) return ''
  return obj[lang] ?? obj['en'] ?? ''
}

export function conditionColor(condition: string): 'success' | 'warning' | 'error' | 'default' {
  switch (condition) {
    case 'GOOD':
      return 'success'
    case 'FAIR':
      return 'warning'
    case 'POOR':
      return 'error'
    default:
      return 'default'
  }
}
