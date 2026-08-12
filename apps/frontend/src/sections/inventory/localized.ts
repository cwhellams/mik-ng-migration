// Inventory-specific helper (condition-colour mapping) plus re-exports of the
// app-wide localised-text helpers under their original names, so existing
// inventory call sites don't need to change.

import { localText, resolveLanguage, type UiLanguage } from '../../utils/localisedText'

export type { UiLanguage }
export { resolveLanguage }
export const localName = localText

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
