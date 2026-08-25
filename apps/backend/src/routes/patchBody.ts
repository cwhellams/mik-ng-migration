/**
 * Zod re-applies a field's `.default()` even under `.partial()`: parsing
 * `{ notes: 'x' }` against a schema whose `quantity` is `.default(1)` yields
 * `{ notes: 'x', quantity: 1 }`. A query layer that then writes every defined
 * field — which is what "patch the fields the caller sent" looks like in
 * Kysely, since `undefined` is dropped from the SET clause — silently resets
 * fields nobody mentioned.
 *
 * `onlySent` drops every key the request body did not actually carry, so the
 * parsed patch says what the caller said. Validation still runs over the whole
 * body first; only absent keys are removed afterwards.
 *
 * One helper rather than a `'field' in body` chain per route: those chains are
 * per-key lists, and a field added to the schema later escapes them silently —
 * which is exactly how `quantity` and `isReservable` got through.
 *
 * Keys the route supplies itself (an id from the path) are not in the body, so
 * add them back after calling this:
 *
 *   const patch = { ...onlySent(parsed, req.body), itemId: req.params.id }
 */
export const onlySent = <T extends object>(parsed: T, body: unknown): Partial<T> => {
  const sent = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}

  return Object.fromEntries(Object.entries(parsed).filter(([key]) => key in sent)) as Partial<T>
}
