import { type FlightInvoicePayload, type InvoicableFlight } from '../../routes/flight-log/models.ts'
import type { InvoicePost } from '../simplbooks/models.ts'

import { getAircraftPriceForDate } from '../../db/aircraft-pricing-queries.ts'
import { getArticleIdsByCode } from '../../db/invoicing-queries.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

export async function createFlightInvoicePayload(
  payload: FlightInvoicePayload,
): Promise<InvoicePost> {
  // Create Simplbooks tasks from the flights array
  const tasks = await createTasksForFlights(payload.flights)
  const billingId = payload.flights[0].billingId

  if (!billingId) {
    throw new Error('Cannot create invoice: billable member has no billing ID')
  }

  const clientId = parseInt(billingId, 10)

  if (isNaN(clientId)) {
    throw new Error(`Invalid billing ID: ${billingId}`)
  }

  return {
    Invoice: {
      client_id: clientId,
      additional_info: getBillingRemarks(payload.flights),
    },
    Tasks: tasks,
  }
}

function getBillingRemarks(flights: InvoicableFlight[]): string {
  const remarks = flights
    .map(flight => flight.billingRemarks)
    .filter(remark => remark && remark.trim() !== '')

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
): Promise<InvoicePost['Tasks']> => {
  const tasks: InvoicePost['Tasks'] = []

  // Extract unique aircraft registrations
  const uniqueRegistrations = [...new Set(flights.map(f => f.aircraftRegistration))]

  // Fetch article IDs for all unique aircraft in one query
  const articleIdMap = await getArticleIdsByCode(uniqueRegistrations)

  for (const flight of flights) {
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
  }

  return tasks
}
