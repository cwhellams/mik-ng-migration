import { sql } from 'kysely'
import { camelDb } from './connection.ts'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'
import type { FuelReportEntry, FuelReportFilters } from '@mik/contracts/fuel-report'

// Claims that are still a draft, or were rejected, aren't reliable enough to report a price from.
const REPORTABLE_STATUSES = [
  ExpenseClaimStatus.SUBMITTED,
  ExpenseClaimStatus.PENDING_INFO,
  ExpenseClaimStatus.APPROVED,
  ExpenseClaimStatus.SYNCED,
]

export async function getRecentFuelings(filters: FuelReportFilters): Promise<FuelReportEntry[]> {
  const rows = await camelDb
    .selectFrom('accts.expenseClaimLineItem as li')
    .innerJoin('accts.expenseClaim as c', 'c.id', 'li.claimId')
    .innerJoin('accts.expenseCategory as cat', 'cat.id', 'c.categoryId')
    .leftJoin('static.airfields as af', 'af.ident', 'li.airport')
    .select([
      'li.fuelDate',
      'li.airport',
      'af.name as airportName',
      'li.quantity',
      'li.fuelType',
      sql<
        number | null
      >`case when c.ccy = 'EUR' then li.unit_price else li.unit_price * c.fx_rate end`.as(
        'pricePerLitreEur',
      ),
    ])
    .where('cat.code', '=', 'fuel')
    .where('li.airport', 'is not', null)
    .where('li.fuelDate', 'is not', null)
    .where('c.status', 'in', REPORTABLE_STATUSES)
    .where('li.fuelDate', '>=', sql<string>`now() - make_interval(days => ${filters.days})`)
    .orderBy('li.fuelDate', 'desc')
    .execute()

  return rows.map((row) => ({
    date: row.fuelDate as string,
    airportIdent: row.airport as string,
    airportName: row.airportName ?? null,
    litres: Number(row.quantity),
    fuelType: row.fuelType,
    pricePerLitreEur: row.pricePerLitreEur != null ? Number(row.pricePerLitreEur) : null,
  }))
}
