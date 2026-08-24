// Re-exports of the shared localised-text and condition-colour helpers under
// the names inventory call sites already use.

import { localText, resolveLanguage, type UiLanguage } from '@mik/ui/utils/localisedText'

export type { UiLanguage }
export { resolveLanguage }
export { conditionColor } from '@mik/ui/utils/inventoryCondition'
export const localName = localText
