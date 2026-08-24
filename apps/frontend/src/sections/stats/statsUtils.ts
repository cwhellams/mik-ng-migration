/**
 * Year-range helpers shared by the statistics views (see #894).
 *
 * Every stats section asks the API for one of the same two windows — the last
 * `VITE_STATS_YEAR_RANGE` calendar years, or the years spanned by the last 12
 * months — and each used to compute it from its own copy of the env var.
 */

/** Inclusive year window as the stats endpoints expect it. */
export type YearRange = { yrFrom: number; yrTo: number }

/**
 * How many calendar years the yearly charts cover, counting the current one.
 * Read per call rather than once at module load so tests can stub the env var.
 */
const statsYearRange = () => Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

/** The last `VITE_STATS_YEAR_RANGE` calendar years, ending with the current one. */
export const getYearRange = (): YearRange => {
  const currentYear = new Date().getFullYear()
  return { yrFrom: currentYear - (statsYearRange() - 1), yrTo: currentYear }
}

/**
 * The calendar years the last 12 months fall in: in December that is the
 * current year on its own, in every other month it also needs the previous one.
 */
export const getMonthlyRange = (): YearRange => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  return { yrFrom: currentMonth === 12 ? currentYear : currentYear - 1, yrTo: currentYear }
}
