/**
 * Picks a display string out of an `{en, fi, sv}` record that reached the
 * backend as untyped JSON — a product's `name` or `description`, a shop order
 * item's `productSnapshot.name`.
 *
 * The chain is the app's agreed one (requested language, then English — see
 * `localText` in `@mik/ui/utils/localisedText`) plus one extra step: any other
 * language that has text. A product stored with only a Swedish name would
 * otherwise leave a blank where its name belongs, and a blank product name is
 * the very failure #1248 is about.
 *
 * `@mik/ui`'s `localText` cannot be reused here — that package is React- and
 * DOM-facing and the backend must not import it — so this is the backend's one
 * copy of the idea. It is deliberately the *only* one: the shop order emails
 * and the SimplBooks invoice lines both read the same `productSnapshot.name`,
 * and until they shared this function they resolved it in two different orders
 * (requested-language-first vs. a hardcoded fi-first), so the same product
 * could be named one thing in a confirmation email and another on the invoice.
 * A caller that wants Finnish first asks for it: `localisedText(value, 'fi')`.
 */
export const localisedText = (value: unknown, lang: string): string => {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  const pick = (key: string) =>
    typeof record[key] === 'string' ? (record[key] as string).trim() : ''
  return pick(lang) || pick('en') || Object.keys(record).map(pick).find(Boolean) || ''
}
