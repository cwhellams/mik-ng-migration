// Pure helpers for the expense claim forms. Extracted from expenseShared.tsx so
// they can be unit tested without pulling in MUI or the API layer.

import type { ExpenseLineItem } from '@mik/contracts/expenses'

// ─── Unit defaults ────────────────────────────────────────────────────────────

export function defaultUnitForCategory(code: string | undefined): ExpenseLineItem['unit'] {
  switch (code) {
    case 'fuel':
      return 'l'
    case 'mileage':
      return 'km'
    default:
      return 'pcs'
  }
}

// ─── Editable line item type (date always a string, never null) ───────────────

export type EditableLineItem = Omit<ExpenseLineItem, 'date'> & {
  date: string
  costCentreCode?: string | null
  airport?: string | null
}

export const makeDefaultLineItem = (
  unit: EditableLineItem['unit'] = 'pcs',
  costCentreCode?: string,
): EditableLineItem => ({
  itemId: null,
  description: '',
  date: new Date().toISOString().substring(0, 10),
  quantity: 1,
  unit,
  unitPrice: 0,
  sortOrder: 0,
  costCentreCode: costCentreCode ?? null,
  airport: null,
  paidWithClubCard: false,
})

// ─── Item code → aircraft (cost centre) matching ───────────────────────────────

/**
 * Fuel invoice item codes end with the aircraft registration's last 3 letters
 * (e.g. an item code ending in "IHQ" is fuel for OH-IHQ). Cost centre codes are
 * the aircraft registrations themselves, so matching on that suffix lets us
 * pre-select the aircraft cost centre once a fuel item is chosen.
 */
export function matchAircraftCostCentre(
  itemCode: string,
  costCentres: { code: string; description: string }[],
): string | undefined {
  const suffix = itemCode.slice(-3).toUpperCase()
  if (suffix.length < 3) return undefined
  return costCentres.find((cc) => cc.code.slice(-3).toUpperCase() === suffix)?.code
}

/**
 * Whether an ICAO airport code lies outside Finland (issue #1020) — Finnish
 * aerodromes all use the EFxx prefix, so anything else counts as abroad.
 */
export function isAirportOutsideFinland(icao: string | null | undefined): boolean {
  return !!icao && !icao.toUpperCase().startsWith('EF')
}
