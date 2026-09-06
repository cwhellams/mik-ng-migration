import type { Kysely, Transaction } from 'kysely'

import { db } from '../../db/connection.ts'
import type { DB } from '@mik/db-schema/schema'
import type {
  InvoicableFlight,
  PrepaidFlightGroup,
  PrepaidInvoicableFlight,
  PrepaidFlightUsage,
} from '@mik/contracts/flight-log'

type QueryExecutor = Kysely<DB> | Transaction<DB>

type ActiveMemberPackage = {
  memberPackageId: number
  aircraftRegistration: string
  totalMinutes: number
  usedMinutes: number
  remainingMinutes: number
  perMinRate: number
  expiresAt: string
  simplbooksItemId: string | null
}

export type PlannedPrepaidFlight = PrepaidInvoicableFlight
export type PlannedPrepaidGroup = PrepaidFlightGroup

export type PlannedPrepaidUsage = {
  groups: PlannedPrepaidGroup[]
}

function getExecutor(executor?: QueryExecutor): QueryExecutor {
  return executor ?? db
}

export function getBillableMinutes(flight: InvoicableFlight): number {
  return flight.isTrainingProgramPilot ? flight.blockMins : flight.flightMins
}

function getCreditedMinutes(flight: InvoicableFlight): number {
  return Math.max(0, flight.creditedMins ?? 0)
}

export function computeTopUpMins(flight: InvoicableFlight, minBillableMins: number): number {
  if (!flight.isBillableFlight) return 0
  // Exception granted by treasurer: bill only actual minutes (no top-up to 20 min minimum)
  if (flight.minBillableExceptionApprovedByMemberId) return 0
  const billableMins = getBillableMinutes(flight)
  const isLocalFlight = flight.departureAirport === flight.arrivalAirport
  return isLocalFlight && billableMins < minBillableMins ? minBillableMins - billableMins : 0
}

export function getPackageEligibleMinutes(flight: InvoicableFlight, topUpMins = 0): number {
  if (!flight.isBillableFlight) {
    return 0
  }

  return Math.max(0, getBillableMinutes(flight) + topUpMins - getCreditedMinutes(flight))
}

async function loadActivePackagesForMember(
  memberId: string,
  options?: {
    executor?: QueryExecutor
    lockRows?: boolean
  },
): Promise<ActiveMemberPackage[]> {
  const executor = getExecutor(options?.executor)
  const today = new Date().toISOString().slice(0, 10)

  let query = executor
    .selectFrom('prepaid.memberPackages as mp')
    .innerJoin('prepaid.packages as p', 'p.productId', 'mp.productId')
    .select([
      'mp.memberPackageId',
      'mp.productId',
      'mp.totalMinutes',
      'mp.usedMinutes',
      'mp.expiresAt',
      'p.aircraftRegistration',
      'p.perMinRate',
    ])
    .where('mp.memberId', '=', memberId)
    .where('mp.isExpired', '=', false)
    .where('mp.expiresAt', '>=', today)
    .where('p.isActive', '=', true)
    .where((eb) => eb('mp.totalMinutes', '>', eb.ref('mp.usedMinutes')))
    .orderBy('p.aircraftRegistration', 'asc')
    .orderBy('mp.expiresAt', 'asc')
    .orderBy('mp.memberPackageId', 'asc')

  if (options?.lockRows) {
    query = query.forUpdate()
  }

  const rows = await query.execute()

  // Fetch simplbooks_item_id separately to avoid FOR UPDATE on the nullable side of an outer join
  const productIds = [...new Set(rows.map((r) => r.productId))]
  const simplbooksItemIdByProductId = new Map<string, string | null>()
  if (productIds.length > 0) {
    const productRows = await getExecutor(options?.executor)
      .selectFrom('shop.products')
      .select(['productId', 'simplbooksItemId'])
      .where('productId', 'in', productIds)
      .execute()
    for (const pr of productRows) {
      simplbooksItemIdByProductId.set(pr.productId, pr.simplbooksItemId ?? null)
    }
  }

  return rows.map((row) => ({
    memberPackageId: row.memberPackageId,
    aircraftRegistration: row.aircraftRegistration,
    totalMinutes: row.totalMinutes,
    usedMinutes: row.usedMinutes,
    remainingMinutes: row.totalMinutes - row.usedMinutes,
    perMinRate: Number(row.perMinRate),
    expiresAt: row.expiresAt,
    simplbooksItemId: simplbooksItemIdByProductId.get(row.productId) ?? null,
  }))
}

function clonePackagesByAircraft(
  packages: ActiveMemberPackage[],
): Map<string, ActiveMemberPackage[]> {
  const byAircraft = new Map<string, ActiveMemberPackage[]>()

  for (const pkg of packages) {
    const current = byAircraft.get(pkg.aircraftRegistration) ?? []
    current.push({ ...pkg })
    byAircraft.set(pkg.aircraftRegistration, current)
  }

  return byAircraft
}

function sumRemainingMinutes(packages: ActiveMemberPackage[]): number {
  return packages.reduce((total, pkg) => total + pkg.remainingMinutes, 0)
}

function sortFlightsChronologically(flights: InvoicableFlight[]): InvoicableFlight[] {
  return [...flights].sort(
    (left, right) =>
      new Date(left.takeoffTimeUtc).getTime() - new Date(right.takeoffTimeUtc).getTime(),
  )
}

export async function planPrepaidFlightUsage(
  flights: InvoicableFlight[],
  options?: {
    executor?: QueryExecutor
    lockRows?: boolean
    minBillableMins?: number
  },
): Promise<PlannedPrepaidUsage> {
  if (flights.length === 0) {
    return { groups: [] }
  }

  const minBillableMins =
    options?.minBillableMins ?? (Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20)

  const flightsByMember = flights.reduce((acc, flight) => {
    const memberFlights = acc.get(flight.billableMemberId) ?? []
    memberFlights.push(flight)
    acc.set(flight.billableMemberId, memberFlights)
    return acc
  }, new Map<string, InvoicableFlight[]>())

  const groups: PlannedPrepaidGroup[] = []

  for (const [memberId, memberFlights] of flightsByMember.entries()) {
    const packages = await loadActivePackagesForMember(memberId, options)
    const packagesByAircraft = clonePackagesByAircraft(packages)

    const memberFlightsByAircraft = memberFlights.reduce((acc, flight) => {
      const groupFlights = acc.get(flight.aircraftRegistration) ?? []
      groupFlights.push(flight)
      acc.set(flight.aircraftRegistration, groupFlights)
      return acc
    }, new Map<string, InvoicableFlight[]>())

    for (const [aircraftRegistration, groupedFlights] of memberFlightsByAircraft.entries()) {
      const aircraftPackages = packagesByAircraft.get(aircraftRegistration) ?? []
      const availableAtStart = sumRemainingMinutes(aircraftPackages)
      const plannedFlights: PlannedPrepaidFlight[] = []

      for (const flight of sortFlightsChronologically(groupedFlights)) {
        const availableBeforeFlight = sumRemainingMinutes(aircraftPackages)
        const topUpMins = computeTopUpMins(flight, minBillableMins)
        let remainingEligibleMinutes = getPackageEligibleMinutes(flight, topUpMins)
        const packageUsages: PrepaidFlightUsage[] = []

        for (const pkg of aircraftPackages) {
          if (remainingEligibleMinutes <= 0) {
            break
          }

          if (pkg.remainingMinutes <= 0) {
            continue
          }

          const minutesUsed = Math.min(pkg.remainingMinutes, remainingEligibleMinutes)
          if (minutesUsed <= 0) {
            continue
          }

          packageUsages.push({
            memberPackageId: pkg.memberPackageId,
            minutesUsed,
            perMinRate: pkg.perMinRate,
            expiresAt: pkg.expiresAt,
            simplbooksItemId: pkg.simplbooksItemId,
          })

          pkg.remainingMinutes -= minutesUsed
          remainingEligibleMinutes -= minutesUsed
        }

        const prepaidMinutesUsed = packageUsages.reduce(
          (total, usage) => total + usage.minutesUsed,
          0,
        )

        plannedFlights.push({
          ...flight,
          billableMinutes: getBillableMinutes(flight),
          packageEligibleMinutes: getPackageEligibleMinutes(flight, topUpMins),
          availablePrepaidMinutes: availableBeforeFlight,
          prepaidMinutesUsed,
          standardMinutes: remainingEligibleMinutes,
          remainingPrepaidMinutes: sumRemainingMinutes(aircraftPackages),
          topUpMins,
          packageUsages,
        })
      }

      groups.push({
        billableMemberId: memberId,
        billableMemberLastName: plannedFlights[0]?.billableMemberLastName ?? null,
        aircraftRegistration,
        availablePrepaidMinutes: availableAtStart,
        prepaidMinutesUsed: plannedFlights.reduce(
          (total, flight) => total + flight.prepaidMinutesUsed,
          0,
        ),
        remainingPrepaidMinutes: sumRemainingMinutes(aircraftPackages),
        flights: plannedFlights,
      })
    }
  }

  return { groups }
}

export async function applyPrepaidFlightUsagePlan(
  plan: PlannedPrepaidUsage,
  invoiceId: string | number,
  txn: Transaction<DB>,
): Promise<void> {
  const usages = plan.groups.flatMap((group) =>
    group.flights.flatMap((flight) =>
      flight.packageUsages.map((usage) => ({
        ...usage,
        flightId: flight.flightId,
      })),
    ),
  )

  if (usages.length === 0) {
    return
  }

  const packageIds = [...new Set(usages.map((usage) => usage.memberPackageId))]
  const rows = await txn
    .selectFrom('prepaid.memberPackages')
    .select(['memberPackageId', 'totalMinutes', 'usedMinutes'])
    .where('memberPackageId', 'in', packageIds)
    .forUpdate()
    .execute()

  const packageState = new Map(
    rows.map((row) => [
      row.memberPackageId,
      {
        totalMinutes: row.totalMinutes,
        usedMinutes: row.usedMinutes,
      },
    ]),
  )

  const totalsByPackage = usages.reduce((acc, usage) => {
    acc.set(usage.memberPackageId, (acc.get(usage.memberPackageId) ?? 0) + usage.minutesUsed)
    return acc
  }, new Map<number, number>())

  for (const [memberPackageId, minutesUsed] of totalsByPackage.entries()) {
    const current = packageState.get(memberPackageId)
    if (!current) {
      throw new Error(`Prepaid member package ${memberPackageId} was not found during invoicing`)
    }

    const remainingMinutes = current.totalMinutes - current.usedMinutes
    if (minutesUsed > remainingMinutes) {
      throw new Error(
        `Prepaid member package ${memberPackageId} has insufficient remaining minutes for invoicing`,
      )
    }

    const nextUsedMinutes = current.usedMinutes + minutesUsed
    await txn
      .updateTable('prepaid.memberPackages')
      .set({
        usedMinutes: nextUsedMinutes,
        isExpired: nextUsedMinutes >= current.totalMinutes,
        updatedAt: new Date(),
      })
      .where('memberPackageId', '=', memberPackageId)
      .execute()
  }

  for (const usage of usages) {
    await txn
      .insertInto('prepaid.usageLog')
      .values({
        memberPackageId: usage.memberPackageId,
        flightId: usage.flightId,
        minutesUsed: usage.minutesUsed,
        note: `Flight ${usage.flightId}, invoice ${invoiceId}`,
      })
      .execute()
  }
}
