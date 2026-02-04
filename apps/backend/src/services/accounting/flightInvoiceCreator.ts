import { type FlightInvoicePayload, type InvoicableFlight } from '../../routes/flight-log/models.ts'
import type { InvoicePost } from '../simplbooks/models.ts'

import { getAircraftPriceForDate } from '../../db/aircraft-pricing-queries.ts'
import {
  getArticleIdsByCode,
  getKalustonkayttoFee,
  hasRequestedEquipmentFee,
} from '../../db/invoicing-queries.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import logger from '../../lib/logger.ts'
import { ART_EQUIP_USAGE_FEE_CODE } from './config.ts'

dayjs.extend(utc)
dayjs.extend(timezone)

export async function createFlightInvoicePayload(
  payload: FlightInvoicePayload,
  billableMemberId: string,
): Promise<InvoicePost> {
  // Create Simplbooks tasks from the flights array

  const [tasks, kalustonkayttoRemarks] = await createTasksForFlights(payload.flights)
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
    Invoice: {
      client_id: simplbooksClientId,
      additional_info: getBillingRemarks(payload.flights, kalustonkayttoRemarks),
    },
    Tasks: tasks,
  }
}

function getBillingRemarks(flights: InvoicableFlight[], kalustonkayttoRemarks: string): string {
  const remarks = flights
    .map(flight => flight.billingRemarks)
    .filter(remark => remark && remark.trim() !== '')

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

const createTasksForFlights = async (
  flights: InvoicableFlight[],
): Promise<[InvoicePost['Tasks'], string]> => {
  const tasks: InvoicePost['Tasks'] = []

  // Extract unique aircraft registrations
  const uniqueRegistrations = [...new Set(flights.map(f => f.aircraftRegistration))]
  const articleCodes = [...uniqueRegistrations, ART_EQUIP_USAGE_FEE_CODE]
  const kalustonkayttoFee = await getKalustonkayttoFee()
  if (!kalustonkayttoFee) {
    throw new Error('Kalustonkaytto fee article not found in the database')
  }

  // Fetch article IDs for all unique aircraft in one query
  const articleIdMap = await getArticleIdsByCode(articleCodes)
  let applyKalustonkayttoRemarks = false

  // Precompute equipment-fee request status per distinct takeoff year (same billable member for all flights)
  const equipmentFeeRequestedByYear = new Map<number, boolean>()
  const billableMemberId = flights[0]?.billableMemberId
  if (billableMemberId !== undefined && billableMemberId !== null) {
    const distinctTakeoffYears = new Set<number>()
    for (const flight of flights) {
      distinctTakeoffYears.add(new Date(flight.takeoffTimeUtc).getUTCFullYear())
    }
    for (const year of distinctTakeoffYears) {
      const requested = await hasRequestedEquipmentFee(year, billableMemberId)
      equipmentFeeRequestedByYear.set(year, requested)
    }
  }

  for (const flight of flights) {
    const takeoffYearUtc = new Date(flight.takeoffTimeUtc).getUTCFullYear()
    const equipmentFeeRequested = equipmentFeeRequestedByYear.get(takeoffYearUtc) ?? false
    const applyKalustonkayttoFee = !equipmentFeeRequested

    if (applyKalustonkayttoFee) {
      applyKalustonkayttoRemarks = true
    }

    // Get the price per minute for this aircraft on the flight date
    const pricePerMinute = await getUnitPriceForFlightItem(
      flight.aircraftRegistration,
      new Date(flight.takeoffTimeUtc),
    )

    // Get article ID from the pre-fetched map
    const articleId = articleIdMap.get(flight.aircraftRegistration)
    if (!articleId) {
      throw new Error(`No article found for aircraft registration ${flight.aircraftRegistration}`)
    }

    const billableMins = flight.isTrainingProgramPilot ? flight.blockMins : flight.flightMins

    tasks.push({
      Task: {
        article_id: articleId,
        code: flight.aircraftRegistration,
        amount: billableMins,
        price_per_unit: pricePerMinute,
        contents: `${dayjs(flight.takeoffTimeUtc).tz('Europe/Helsinki').format('YYYY-MM-DD')} ${flight.departureAirport} -> ${flight.arrivalAirport} ${flight.isTrainingProgramPilot ? '(Training Program Flight - Block time)' : '(flight time)'}`,
      },
      Projects: [
        {
          code: flight.aircraftRegistration, // Cost centre code - to be determined based on flight type or other criteria
        },
      ],
    })

    if (applyKalustonkayttoFee) {
      logger.info(
        `Adding equipment usage fee for flight ${flight.flightId} of member ${flight.billableMemberId}`,
      )

      tasks.push({
        Task: {
          article_id: kalustonkayttoFee.id,
          code: kalustonkayttoFee.code,
          amount: billableMins,
          price_per_unit: kalustonkayttoFee.markup_value,
          contents: `${flight.aircraftRegistration} ${dayjs(flight.takeoffTimeUtc).tz('Europe/Helsinki').format('YYYY-MM-DD')} ${flight.departureAirport} - ${flight.arrivalAirport}`,
          name: kalustonkayttoFee.name,
        },
        Projects: [
          {
            code: flight.aircraftRegistration, // Cost centre code - to be determined based on flight type or other criteria
          },
        ],
      })
    }
  }

  return [tasks, applyKalustonkayttoRemarks ? `${kalustonkayttoFee.contents}` : '']
}
