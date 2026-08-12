import { sql } from 'kysely'
import { db } from './connection.ts'
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
  const rows = await db
    .selectFrom('accts.expense_claim_line_item as li')
    .innerJoin('accts.expense_claim as c', 'c.id', 'li.claim_id')
    .innerJoin('accts.expense_category as cat', 'cat.id', 'c.category_id')
    .leftJoin('static.airfields as af', 'af.ident', 'li.airport')
    .select([
      'li.fuel_date',
      'li.airport',
      'af.name as airport_name',
      'li.quantity',
      'li.fuel_type',
      sql<
        number | null
      >`case when c.ccy = 'EUR' then li.unit_price else li.unit_price * c.fx_rate end`.as(
        'price_per_litre_eur',
      ),
    ])
    .where('cat.code', '=', 'fuel')
    .where('li.airport', 'is not', null)
    .where('li.fuel_date', 'is not', null)
    .where('c.status', 'in', REPORTABLE_STATUSES)
    .where(sql`li.fuel_date`, '>=', sql`now() - make_interval(days => ${filters.days})`)
    .orderBy('li.fuel_date', 'desc')
    .execute()

  return rows.map((row) => ({
    date: row.fuel_date as string,
    airportIdent: row.airport as string,
    airportName: row.airport_name ?? null,
    litres: Number(row.quantity),
    fuelType: row.fuel_type,
    pricePerLitreEur: row.price_per_litre_eur != null ? Number(row.price_per_litre_eur) : null,
  }))
}
