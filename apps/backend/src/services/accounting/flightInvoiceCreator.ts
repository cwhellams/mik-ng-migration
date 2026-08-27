import { type FlightInvoicePayload, type InvoicableFlight } from '@mik/contracts/flight-log'
import type { InvoicePost } from '../simplbooks/models.ts'
import type { ArticleFee } from '@mik/contracts/invoicing'

import { getAircraftPriceForDate } from '../../db/aircraft-pricing-queries.ts'
import { getArticleFees, hasRequestedEquipmentFee } from '../../db/invoicing-queries.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import logger from '../../lib/logger.ts'
import { ART_ENTRY_ERROR_CODE, ART_EQUIP_USAGE_FEE_CODE } from './config.ts'
import { resolveArticlePrice } from './articlePricing.ts'
import {
  planPrepaidFlightUsage,
  computeTopUpMins,
  type PlannedPrepaidFlight,
  type PlannedPrepaidUsage,
} from './flightPrepaidAllocator.ts'
import type { Kysely, Transaction } from 'kysely'
import type { DB } from '../../db/schema.d.ts'

dayjs.extend(utc)
dayjs.extend(timezone)

type QueryExecutor = Kysely<DB> | Transaction<DB>

export async function createPlannedFlightInvoicePayload(
  payload: FlightInvoicePayload,
  billableMemberId: string,
  options?: {
    executor?: QueryExecutor
    lockPrepaidRows?: boolean
  },
): Promise<{
  invoice: InvoicePost
  prepaidUsagePlan: PlannedPrepaidUsage
}> {
  const minBillableMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20
  const prepaidUsagePlan = await planPrepaidFlightUsage(payload.flights, {
    executor: options?.executor,
    lockRows: options?.lockPrepaidRows,
    minBillableMins,
  })

  const [tasks, kalustonkayttoRemarks] = await createTasksForFlights(
    payload.flights,
    prepaidUsagePlan,
  )
  const billingId = payload.flights[0].billingId

  if (!billingId) {
    throw new Error(
      `Cannot create invoice: billable member has no billing ID for member ${billableMemberId}`,
    )
  }

  const simplbooksClientId = Number.parseInt(billingId, 10)

  if (Number.isNaN(simplbooksClientId)) {
    throw new TypeError(`Invalid billing ID: ${billingId} for member ${billableMemberId}`)
  }

  return {
    invoice: {
      Invoice: {
        client_id: simplbooksClientId,
        additional_info: getBillingRemarks(payload.flights, kalustonkayttoRemarks),
      },
      Tasks: tasks,
    },
    prepaidUsagePlan,
  }
}

export async function createFlightInvoicePayload(
  payload: FlightInvoicePayload,
  billableMemberId: string,
): Promise<InvoicePost> {
  const { invoice } = await createPlannedFlightInvoicePayload(payload, billableMemberId)
  return invoice
}

function getBillingRemarks(flights: InvoicableFlight[], kalustonkayttoRemarks: string): string {
  const remarks = flights
    .map((flight) => flight.billingRemarks)
    .filter((remark) => remark && remark.trim() !== '')

  kalustonkayttoRemarks && remarks.push(kalustonkayttoRemarks)

  return remarks.join('; ')
}

async function getUnitPriceForFlightItem(
  aircraftRegistration: string,
  flightDate: Date,
): Promise<number> {
  // Convert Date to YYYY-MM-DD format in Helsinki timezone
  const dateStr = dayjs(flightDate).tz('Europe/Helsinki').format('YYYY-MM-DD')

  // Query the database for the price valid on this date
  const pricePerMin = await getAircraftPriceForDate(aircraftRegistration, dateStr)

  if (pricePerMin === null) {
    throw new Error(`No pricing found for aircraft ${aircraftRegistration} on date ${dateStr}`)
  }

  return pricePerMin
}

function createFlightTaskContents(flight: InvoicableFlight, additionalText?: string): string {
  const localDate = dayjs(flight.takeoffTimeUtc).tz('Europe/Helsinki').format('YYYY-MM-DD')
  const baseContents = `${localDate} ${flight.departureAirport} -> ${flight.arrivalAirport}`
  const timeBasis = flight.isTrainingProgramPilot
    ? '(Training Program Flight - Block time)'
    : '(flight time)'
  const nonBillableNote = flight.isBillableFlight ? '' : ' [Non-billable flight - 100% discount]'
  const additionalNote = additionalText ? ` (${additionalText})` : ''
  const virhemerkintaNote = flight.entryErrorFee ? (flight.validationRemarks ?? '') : ''

  return `${baseContents} ${timeBasis} ${nonBillableNote} ${additionalNote} ${virhemerkintaNote}`.trim()
}

interface FlightArticleFees {
  kalustonkayttoFee: ArticleFee
  virhemerkintaFee: ArticleFee
  articleIdMap: Map<string, number>
  packageArticleIdMap: Map<string, number>
}

async function fetchFlightFees(
  registrations: string[],
  packageItemCodes: string[] = [],
): Promise<FlightArticleFees> {
  const packageStringCodes = packageItemCodes.filter((code) =>
    Number.isNaN(Number.parseInt(code, 10)),
  )

  const fees = await getArticleFees([
    ART_EQUIP_USAGE_FEE_CODE,
    ART_ENTRY_ERROR_CODE,
    ...registrations,
    ...packageStringCodes,
  ])

  const kalustonkayttoFee = fees.find((f) => f.code === ART_EQUIP_USAGE_FEE_CODE)
  if (!kalustonkayttoFee) {
    throw new Error('Kalustonkaytto fee article not found in the database')
  }

  const virhemerkintaFee = fees.find((f) => f.code === ART_ENTRY_ERROR_CODE)
  if (!virhemerkintaFee) {
    throw new Error('VIRHEMERKINTA fee article not found in the database')
  }

  const articleIdMap = new Map(
    registrations.flatMap((reg) => {
      const fee = fees.find((f) => f.code === reg)
      return fee ? [[reg, fee.id] as [string, number]] : []
    }),
  )

  for (const reg of registrations) {
    if (!articleIdMap.has(reg)) {
      throw new Error(`No article found for aircraft registration ${reg}`)
    }
  }

  const packageArticleIdMap = new Map<string, number>()
  for (const code of packageItemCodes) {
    const numericId = Number.parseInt(code, 10)
    if (!Number.isNaN(numericId)) {
      // Numeric SimplBooks item reference — it IS the article ID, no lookup needed
      packageArticleIdMap.set(code, numericId)
      continue
    }

    const fee = fees.find((f) => f.code === code)
    if (fee) {
      packageArticleIdMap.set(code, fee.id)
    } else {
      logger.warn(
        `No article found for prepaid package SimplBooks item code '${code}' - credit will use aircraft article instead`,
      )
    }
  }

  return { kalustonkayttoFee, virhemerkintaFee, articleIdMap, packageArticleIdMap }
}

async function buildEquipmentFeeRequestedByYear(
  flights: InvoicableFlight[],
): Promise<Map<number, boolean>> {
  const billableMemberId = flights[0]?.billableMemberId
  if (billableMemberId === undefined || billableMemberId === null) {
    return new Map()
  }

  const distinctTakeoffYears = new Set(
    flights.map((f) => new Date(f.takeoffTimeUtc).getUTCFullYear()),
  )

  const entries = await Promise.all(
    [...distinctTakeoffYears].map(
      async (year) =>
        [year, await hasRequestedEquipmentFee(year, billableMemberId)] as [number, boolean],
    ),
  )

  return new Map(entries)
}

function isEquipmentFeeApplicable(
  flight: InvoicableFlight,
  equipmentFeeRequestedByYear: Map<number, boolean>,
): boolean {
  const year = new Date(flight.takeoffTimeUtc).getUTCFullYear()
  return flight.isBillableFlight && !(equipmentFeeRequestedByYear.get(year) ?? false)
}

interface FlightTaskContext {
  articleId: number
  pricePerMinute: number
  minBillableMins: number
  applyKalustonkayttoFee: boolean
  kalustonkayttoFee: ArticleFee
  virhemerkintaFee: ArticleFee
  packageArticleIdMap: Map<string, number>
}

// NOTE: SimplBooks' /invoices/create request schema has no `code` field on Task —
// it only appears on Task in GET responses, and on Projects (cost centre code, kept
// below). Sending it here caused "Tuotteen koodi ei vastaa tietokannan tietoja." for
// prepaid-package credit lines, where article_id legitimately differs from the
// aircraft's own article and so has a different real code than the aircraft
// registration we were sending.
function addFlightTask(
  tasks: InvoicePost['Tasks'],
  flight: InvoicableFlight,
  articleId: number,
  amount: number,
  pricePerUnit: number,
  contents: string,
  discount = 0,
) {
  if (amount <= 0) {
    return
  }

  tasks.push({
    Task: {
      article_id: articleId,
      discount,
      amount,
      price_per_unit: pricePerUnit,
      contents,
    },
    Projects: [{ code: flight.aircraftRegistration }],
  })
}

function createTasksForFlight(
  flight: InvoicableFlight,
  ctx: FlightTaskContext,
  prepaidFlight?: PlannedPrepaidFlight,
): InvoicePost['Tasks'] {
  const billableMins = flight.isTrainingProgramPilot ? flight.blockMins : flight.flightMins
  const creditedMins = Math.max(0, flight.creditedMins ?? 0)
  const discountPct = flight.isBillableFlight ? 0 : 100
  const applyErrorFee = flight.entryErrorFee && flight.isBillableFlight
  const tasks: InvoicePost['Tasks'] = []

  if (flight.isBillableFlight) {
    const packageUsages = prepaidFlight?.packageUsages ?? []
    const standardMinutes =
      prepaidFlight?.standardMinutes ?? Math.max(0, billableMins - creditedMins)
    const topUpMins = prepaidFlight?.topUpMins ?? computeTopUpMins(flight, ctx.minBillableMins)
    const prepaidMinutesUsed = packageUsages.reduce((sum, u) => sum + u.minutesUsed, 0)

    // How many of the top-up minutes fall in the standard (non-prepaid) portion.
    // Prepaid is assumed to cover actual flight time first; any excess covers topup.
    const residualTopUpMins = Math.max(
      0,
      topUpMins - Math.max(0, prepaidMinutesUsed - (billableMins - creditedMins)),
    )
    const standardActualMins = standardMinutes - residualTopUpMins

    // Group usages by (perMinRate, simplbooksItemId) so each unique package gets its own lines
    type PackageGroup = { perMinRate: number; minutesUsed: number; simplbooksItemId: string | null }
    const usageGroups = new Map<string, PackageGroup>()
    for (const usage of packageUsages) {
      const key = `${usage.perMinRate}::${usage.simplbooksItemId ?? ''}`
      const existing = usageGroups.get(key)
      if (existing) {
        existing.minutesUsed += usage.minutesUsed
      } else {
        usageGroups.set(key, {
          perMinRate: usage.perMinRate,
          minutesUsed: usage.minutesUsed,
          simplbooksItemId: usage.simplbooksItemId,
        })
      }
    }

    for (const {
      perMinRate: packageRate,
      minutesUsed: packageMinutes,
      simplbooksItemId,
    } of usageGroups.values()) {
      // Credit line uses the package's own SimplBooks article ID if available
      const creditArticleId = simplbooksItemId
        ? (ctx.packageArticleIdMap.get(simplbooksItemId) ?? ctx.articleId)
        : ctx.articleId

      addFlightTask(
        tasks,
        flight,
        ctx.articleId,
        packageMinutes,
        packageRate,
        createFlightTaskContents(flight, 'prepaid package rate'),
      )
      addFlightTask(
        tasks,
        flight,
        creditArticleId,
        packageMinutes,
        -packageRate,
        createFlightTaskContents(flight, 'prepaid package credit'),
      )
    }

    addFlightTask(
      tasks,
      flight,
      ctx.articleId,
      standardActualMins + creditedMins,
      ctx.pricePerMinute,
      createFlightTaskContents(flight),
    )

    if (residualTopUpMins > 0) {
      logger.info(
        `Adding minimum billable time top-up (${residualTopUpMins} min) for flight ${flight.flightId}`,
      )
      addFlightTask(
        tasks,
        flight,
        ctx.articleId,
        residualTopUpMins,
        ctx.pricePerMinute,
        createFlightTaskContents(flight, `minimum billable time top-up: ${residualTopUpMins} min`),
      )
    }
  } else {
    addFlightTask(
      tasks,
      flight,
      ctx.articleId,
      billableMins,
      ctx.pricePerMinute,
      createFlightTaskContents(flight),
      discountPct,
    )
  }

  if (flight.isBillableFlight && creditedMins > 0) {
    logger.info(`Applying credited minutes (${creditedMins}) for flight ${flight.flightId}`)
    addFlightTask(
      tasks,
      flight,
      ctx.articleId,
      creditedMins,
      -ctx.pricePerMinute,
      createFlightTaskContents(flight, `credit for ${creditedMins} min`),
    )
  }

  if (ctx.applyKalustonkayttoFee) {
    logger.info(
      `Adding equipment usage fee for flight ${flight.flightId} of member ${flight.billableMemberId}`,
    )
    tasks.push({
      Task: {
        article_id: ctx.kalustonkayttoFee.id,
        amount: billableMins - creditedMins,
        price_per_unit: resolveArticlePrice(ctx.kalustonkayttoFee),
        contents: createFlightTaskContents(flight),
        name: ctx.kalustonkayttoFee.name,
      },
      Projects: [{ code: flight.aircraftRegistration }],
    })
  }

  if (applyErrorFee) {
    logger.info(
      `Adding entry error fee (VIRHEMERKINTA) for flight ${flight.flightId} of member ${flight.billableMemberId}. Code : ${ART_ENTRY_ERROR_CODE} markup value : ${ctx.virhemerkintaFee.markup_value}`,
    )
    const virhemerkintaAdditionalText =
      ctx.virhemerkintaFee.contents && ctx.virhemerkintaFee.contents.trim() !== ''
        ? ctx.virhemerkintaFee.contents
        : undefined

    tasks.push({
      Task: {
        article_id: ctx.virhemerkintaFee.id,
        amount: ctx.virhemerkintaFee.amount || 1,
        price_per_unit: resolveArticlePrice(ctx.virhemerkintaFee),
        contents: createFlightTaskContents(flight, virhemerkintaAdditionalText),
        name: ctx.virhemerkintaFee.name,
      },
      Projects: [{ code: flight.aircraftRegistration }],
    })
  }

  return tasks
}

const createTasksForFlights = async (
  flights: InvoicableFlight[],
  prepaidUsagePlan: PlannedPrepaidUsage,
): Promise<[InvoicePost['Tasks'], string]> => {
  const uniqueRegistrations = [...new Set(flights.map((f) => f.aircraftRegistration))]

  // Collect unique non-null SimplBooks item codes from packages used in this plan
  const packageItemCodes = [
    ...new Set(
      prepaidUsagePlan.groups.flatMap((g) =>
        g.flights.flatMap((f) =>
          f.packageUsages.map((u) => u.simplbooksItemId).filter((c): c is string => c !== null),
        ),
      ),
    ),
  ]

  const { kalustonkayttoFee, virhemerkintaFee, articleIdMap, packageArticleIdMap } =
    await fetchFlightFees(uniqueRegistrations, packageItemCodes)
  const equipmentFeeRequestedByYear = await buildEquipmentFeeRequestedByYear(flights)
  const applyKalustonkayttoRemarks = flights.some((f) =>
    isEquipmentFeeApplicable(f, equipmentFeeRequestedByYear),
  )
  const minBillableMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20

  const tasks: InvoicePost['Tasks'] = []
  const plannedFlightsById = new Map(
    prepaidUsagePlan.groups.flatMap((group) =>
      group.flights.map((flight) => [flight.flightId, flight]),
    ),
  )

  for (const flight of flights) {
    const pricePerMinute = await getUnitPriceForFlightItem(
      flight.aircraftRegistration,
      new Date(flight.takeoffTimeUtc),
    )

    const billableMins = flight.isTrainingProgramPilot ? flight.blockMins : flight.flightMins
    if (flight.creditedMins && flight.creditedMins > billableMins) {
      logger.warn(
        `Flight ${flight.flightId} has credited minutes (${flight.creditedMins}) greater than billable minutes (${billableMins}). This may result in negative billing. Please verify the flight log data.`,
      )
      throw new Error(
        `Credited minutes (${flight.creditedMins}) cannot exceed billable minutes (${billableMins}) for flight ${flight.flightId}`,
      ) // Prevent creating invoice tasks with negative amounts due to data issues
    }

    tasks.push(
      ...createTasksForFlight(
        flight,
        {
          articleId: articleIdMap.get(flight.aircraftRegistration)!,
          pricePerMinute,
          minBillableMins,
          applyKalustonkayttoFee: isEquipmentFeeApplicable(flight, equipmentFeeRequestedByYear),
          kalustonkayttoFee,
          virhemerkintaFee,
          packageArticleIdMap,
        },
        plannedFlightsById.get(flight.flightId),
      ),
    )
  }

  return [tasks, applyKalustonkayttoRemarks ? `${kalustonkayttoFee.contents}` : '']
}
