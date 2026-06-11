import {
  type FlightLog,
  type FlightLogListEntry,
  type FlightLogListResponse,
} from '../../backend/src/routes/flight-log/models.ts'
import { request } from './services/api.ts'

// only verify flights before this date
const before = '2025-12-31T21:59:00.000Z'

export const verifyFlights = async (limit: number) => {
  const flights = await request<FlightLog, FlightLogListResponse>(
    'GET',
    `v1/flight-logs?status=NEW&limit=${limit}&page=0&endDate=${before}`,
  )

  const last = await migrateBatch(flights?.logs ?? [])
  console.log(`Verified up to flight ID ${last?.flightId} at ${last?.offBlockTimeUtc}`)
}

const migrateBatch = async (
  logs: FlightLogListEntry[],
): Promise<FlightLogListEntry | undefined> => {
  for (const flight of logs) {
    try {
      const res = await request<FlightLog, FlightLog>(
        'POST',
        `v1/flight-logs/${flight.flightId}/validate`,
      )
      console.log(`${res?.flightId} ${res?.offBlockTimeUtc} ${res?.status}`)
    } catch (e) {
      console.log(
        `Error validating flight ${flight.flightId}, stopping migration to timestamp ${flight.offBlockTimeUtc}`,
      )
      console.log(flight)
      throw e
    }
  }

  return logs.at(-1)
}
