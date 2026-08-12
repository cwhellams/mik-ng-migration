import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

import { FlightType } from '@mik/contracts/flight-log'
import { getAircraftPriceForDate } from '../../db/aircraft-pricing-queries.ts'
import { getArticleFees, hasRequestedEquipmentFee } from '../../db/invoicing-queries.ts'
import { ART_EQUIP_USAGE_FEE_CODE } from './config.ts'
import { resolveArticlePrice } from './articlePricing.ts'

dayjs.extend(utc)
dayjs.extend(timezone)

export type FlightForEstimation = {
  flightId: string
  flightType: string
  isBillableFlight: boolean
  isBilled: boolean
  isTrainingProgramPilot: boolean | null
  blockMins: number
  flightMins: number
  departureAirport: string
  arrivalAirport: string
  minBillableExceptionReason: string | null
  creditedMins: number | null
  aircraftRegistration: string
  takeoffTimeUtc: string
}

function getBillableMins(flight: FlightForEstimation): number {
  return flight.isTrainingProgramPilot ? flight.blockMins : flight.flightMins
}

function computeTopUpMins(flight: FlightForEstimation, minBillableMins: number): number {
  if (!flight.isBillableFlight) return 0
  if (flight.minBillableExceptionReason) return 0
  const billableMins = getBillableMins(flight)
  const isLocalFlight = flight.departureAirport === flight.arrivalAirport
  return isLocalFlight && billableMins < minBillableMins ? minBillableMins - billableMins : 0
}

/**
 * Estimates the cost of a batch of flights for a single member.
 * Returns a map from flightId to estimated cost (null = no estimate available).
 *
 * Mirrors the logic in flightInvoiceCreator.ts / flightPrepaidAllocator.ts but
 * without prepaid-package accounting, which is too complex to approximate.
 */
export async function estimateFlightCosts(
  flights: FlightForEstimation[],
  billableMemberId: string,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>()
  const minBillableMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20

  const estimable = flights.filter((f) => !f.isBilled && f.isBillableFlight)

  for (const f of flights) {
    if (f.isBilled || !f.isBillableFlight) result.set(f.flightId, null)
  }

  for (const f of estimable.filter((f) => f.flightType === FlightType.FERRY)) {
    result.set(f.flightId, 0)
  }

  const toPrice = estimable.filter((f) => f.flightType !== FlightType.FERRY)
  if (toPrice.length === 0) return result

  // Batch price lookups by (registration, date-in-Helsinki)
  const priceCache = new Map<string, number | null>()
  const uniqueRegDates = new Map<string, { registration: string; dateStr: string }>()
  for (const f of toPrice) {
    const dateStr = dayjs(f.takeoffTimeUtc).tz('Europe/Helsinki').format('YYYY-MM-DD')
    uniqueRegDates.set(`${f.aircraftRegistration}::${dateStr}`, {
      registration: f.aircraftRegistration,
      dateStr,
    })
  }
  await Promise.all(
    [...uniqueRegDates.entries()].map(async ([key, { registration, dateStr }]) => {
      priceCache.set(key, await getAircraftPriceForDate(registration, dateStr))
    }),
  )

  // Batch equipment-fee lookups by year (UTC, matching invoice creator behaviour)
  const equipFeeByYear = new Map<number, boolean>()
  const distinctYears = new Set(toPrice.map((f) => new Date(f.takeoffTimeUtc).getUTCFullYear()))
  await Promise.all(
    [...distinctYears].map(async (year) => {
      equipFeeByYear.set(year, await hasRequestedEquipmentFee(year, billableMemberId))
    }),
  )

  // Equipment usage fee per-minute rate
  const fees = await getArticleFees([ART_EQUIP_USAGE_FEE_CODE])
  const kalustonkayttoFee = fees.find((f) => f.code === ART_EQUIP_USAGE_FEE_CODE)
  const kalustonkayttoPerMin = kalustonkayttoFee ? resolveArticlePrice(kalustonkayttoFee) : 0

  for (const f of toPrice) {
    const dateStr = dayjs(f.takeoffTimeUtc).tz('Europe/Helsinki').format('YYYY-MM-DD')
    const pricePerMin = priceCache.get(`${f.aircraftRegistration}::${dateStr}`)

    if (pricePerMin === null || pricePerMin === undefined) {
      result.set(f.flightId, null)
      continue
    }

    const rawBillableMins = getBillableMins(f)
    const topUpMins = computeTopUpMins(f, minBillableMins)
    const creditedMins = Math.max(0, f.creditedMins ?? 0)

    // Flight cost mirrors the invoice creator: (billable + topup - credits) * rate
    const flightNetMins = rawBillableMins + topUpMins - creditedMins
    let cost = Math.max(0, flightNetMins) * pricePerMin

    // Equipment fee applies to (billable - credits), without topup (matches invoice creator)
    const year = new Date(f.takeoffTimeUtc).getUTCFullYear()
    if (!(equipFeeByYear.get(year) ?? false) && kalustonkayttoPerMin > 0) {
      cost += Math.max(0, rawBillableMins - creditedMins) * kalustonkayttoPerMin
    }

    result.set(f.flightId, cost)
  }

  return result
}
