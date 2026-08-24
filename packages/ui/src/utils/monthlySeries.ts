/**
 * The trailing 12 months as `YYYY-MM` keys, oldest first.
 *
 * `new Date(y, m - i, 1)` is deliberate: it rolls the year over on its own, so
 * the window straddling January needs no special case.
 */
export const lastTwelveMonths = (now: Date = new Date()): string[] => {
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/** A `YYYY-MM` key for a row that carries its year and month as numbers. */
export const monthKey = (yr: number, mth: number): string => `${yr}-${String(mth).padStart(2, '0')}`

/**
 * Groups rows by aircraft into a per-month series, padding months with no data.
 *
 * The padding is the point: without it a quiet month shortens the axis and the
 * chart reads as "no data recorded" rather than "no flying happened". Both
 * apps' monthly aircraft charts need exactly this — `apps/frontend`'s flight
 * time by type and `apps/admin`'s commercial flight time — and the two had
 * drifted into near-identical copies of it before #1233 put them in separate
 * apps, where the drift would have stopped being visible.
 *
 * `merge` folds a row into the accumulating entry for its month, so a caller
 * that has one row per month and one that has several (a row per flight type)
 * both work.
 */
export const monthlySeriesByAircraft = <Row, Entry extends { month: string }>(
  rows: Row[],
  {
    aircraftOf,
    keyOf,
    merge,
    empty,
    now,
  }: {
    aircraftOf: (row: Row) => string
    keyOf: (row: Row) => string
    merge: (existing: Entry | undefined, row: Row, month: string) => Entry
    empty: (month: string) => Entry
    now?: Date
  },
): Array<{ aircraft: string; data: Entry[] }> => {
  const months = lastTwelveMonths(now)
  const inWindow = new Set(months)
  const byAircraft = new Map<string, Map<string, Entry>>()

  for (const row of rows) {
    const month = keyOf(row)
    if (!inWindow.has(month)) continue

    const aircraft = aircraftOf(row)
    if (!byAircraft.has(aircraft)) byAircraft.set(aircraft, new Map())

    const entries = byAircraft.get(aircraft)!
    entries.set(month, merge(entries.get(month), row, month))
  }

  return [...byAircraft].map(([aircraft, entries]) => ({
    aircraft,
    data: months.map((month) => entries.get(month) ?? empty(month)),
  }))
}
