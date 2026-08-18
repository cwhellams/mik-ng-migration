import { auditCreate, mapAudit } from './audit.ts'
import * as connection from './connection.ts'
import type { DbRow } from './connection.ts'
import type { Remark, CreateRemarkRequest, RecentRemark } from '@mik/contracts/remarks'

function mapRowToRemark(row: DbRow<'flight.remark'>): Remark {
  return {
    remarkId: row.remarkId,
    flightId: row.flightId,
    description: row.description,
    ...mapAudit(row),
  }
}

export async function getRemarksByFlightId(flightId: string): Promise<Remark[]> {
  const rows = await connection.db
    .selectFrom('flight.remark')
    .selectAll()
    .where('flightId', '=', flightId)
    .orderBy('createdAt', 'asc')
    .execute()

  return rows.map(mapRowToRemark)
}

export async function createRemark(data: CreateRemarkRequest, createdBy: string): Promise<Remark> {
  const row = await connection.db
    .insertInto('flight.remark')
    .values({
      flightId: data.flightId,
      description: data.description,
      ...auditCreate(createdBy),
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowToRemark(row)
}

// The flight log admin dashboard's "recent remarks" list -- joined with flight.logs
// for the aircraft registration and takeoff time a dashboard link needs, same as the
// existing "flights with incidents" list next to it.
export async function getRecentRemarks(limit: number): Promise<RecentRemark[]> {
  const rows = await connection.db
    .selectFrom('flight.remark')
    .innerJoin('flight.logs', 'flight.logs.flightId', 'flight.remark.flightId')
    .select([
      'flight.remark.remarkId',
      'flight.remark.flightId',
      'flight.remark.description',
      'flight.remark.createdAt',
      'flight.remark.createdBy',
      'flight.remark.updatedAt',
      'flight.remark.updatedBy',
      'flight.logs.aircraftRegistration',
      'flight.logs.takeoffTimeUtc',
    ])
    .orderBy('flight.remark.createdAt', 'desc')
    .limit(limit)
    .execute()

  return rows.map((row) => ({
    remarkId: row.remarkId,
    flightId: row.flightId,
    description: row.description,
    aircraftRegistration: row.aircraftRegistration,
    takeoffTimeUtc: new Date(row.takeoffTimeUtc).toISOString(),
    ...mapAudit(row),
  }))
}
