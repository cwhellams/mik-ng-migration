/**
 * How a reservation-efficiency percentage is shown, shared by the club-wide report in
 * `sections/stats` and the per-member one in `sections/members` (#1174).
 *
 * The bands are a reading aid, not a rule: 75% of a slot flown is tidy, 50% is worth a
 * look, below that the aircraft spent most of the reservation on the ground.
 */
const GOOD_PCT = 75
const FAIR_PCT = 50

export type EfficiencyColor = 'default' | 'success' | 'warning' | 'error'

export const formatEfficiency = (pct: number | null | undefined): string =>
  pct == null ? '—' : `${Number(pct).toFixed(1)}%`

export const efficiencyColor = (pct: number | null | undefined): EfficiencyColor => {
  if (pct == null) return 'default'
  if (pct >= GOOD_PCT) return 'success'
  if (pct >= FAIR_PCT) return 'warning'
  return 'error'
}
