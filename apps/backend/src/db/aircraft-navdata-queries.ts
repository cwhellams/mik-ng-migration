import type { CamelRow } from './connection.ts'
import * as connection from './connection.ts'
import { sql } from 'kysely'
import type { Navdata, NavdataCreate, NavdataFilters } from '@mik/contracts/aircraft-navdata'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'

export const getAllNavdata = async (filters: Partial<NavdataFilters> = {}): Promise<Navdata[]> => {
  const { aircraftRegistration, limit = 100, offset = 0 } = filters

  let query = connection.camelDb
    .selectFrom('flight.aircraftNavdata as nd')
    .leftJoin('member.register as m', 'm.memberId', 'nd.updaterMemberId')
    .select([
      'nd.navdataId',
      'nd.aircraftRegistration',
      'nd.updaterMemberId',
      sql<string>`trim(concat(m.first_name, ' ', m.last_name))`.as('updaterName'),
      'nd.updateDate',
      'nd.cycle',
      'nd.expires',
      'nd.createdAt',
      'nd.createdBy',
    ])
    .orderBy('nd.updateDate', 'desc')
    .orderBy('nd.navdataId', 'desc')

  if (aircraftRegistration) {
    query = query.where('nd.aircraftRegistration', '=', aircraftRegistration)
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map(mapRecord)
}

export const countNavdata = async (filters: Partial<NavdataFilters> = {}): Promise<number> => {
  const { aircraftRegistration } = filters

  let query = connection.camelDb
    .selectFrom('flight.aircraftNavdata')
    .select((eb) => eb.fn.count('navdataId').as('count'))

  if (aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', aircraftRegistration)
  }

  const result = await query.executeTakeFirst()
  return Number(result?.count ?? 0)
}

export const getLatestNavdata = async (aircraftRegistration: string): Promise<Navdata | null> => {
  const record = await connection.camelDb
    .selectFrom('flight.aircraftNavdata as nd')
    .leftJoin('member.register as m', 'm.memberId', 'nd.updaterMemberId')
    .select([
      'nd.navdataId',
      'nd.aircraftRegistration',
      'nd.updaterMemberId',
      sql<string>`trim(concat(m.first_name, ' ', m.last_name))`.as('updaterName'),
      'nd.updateDate',
      'nd.cycle',
      'nd.expires',
      'nd.createdAt',
      'nd.createdBy',
    ])
    .where('nd.aircraftRegistration', '=', aircraftRegistration)
    .orderBy('nd.updateDate', 'desc')
    .orderBy('nd.navdataId', 'desc')
    .limit(1)
    .executeTakeFirst()

  if (!record) return null
  return mapRecord(record)
}

export const addNavdata = async (data: NavdataCreate, jwt: JWTUser): Promise<Navdata> => {
  const now = new Date()

  const result = await connection.camelDb
    .insertInto('flight.aircraftNavdata')
    .values({
      aircraftRegistration: data.aircraftRegistration,
      updaterMemberId: data.updaterMemberId,
      updateDate: data.updateDate,
      cycle: data.cycle,
      expires: data.expires,
      createdAt: now,
      createdBy: jwt.memberId,
    })
    .returning('navdataId')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Navdata insert failed' })
  }

  const inserted = await getNavdataById(result.navdataId)
  if (!inserted) {
    return problem({ status: 500, detail: 'Navdata not found after insert' })
  }
  return inserted
}

export const getNavdataById = async (navdataId: string): Promise<Navdata | null> => {
  const record = await connection.camelDb
    .selectFrom('flight.aircraftNavdata as nd')
    .leftJoin('member.register as m', 'm.memberId', 'nd.updaterMemberId')
    .select([
      'nd.navdataId',
      'nd.aircraftRegistration',
      'nd.updaterMemberId',
      sql<string>`trim(concat(m.first_name, ' ', m.last_name))`.as('updaterName'),
      'nd.updateDate',
      'nd.cycle',
      'nd.expires',
      'nd.createdAt',
      'nd.createdBy',
    ])
    .where('nd.navdataId', '=', navdataId)
    .executeTakeFirst()

  if (!record) return null
  return mapRecord(record)
}

export const removeNavdata = async (navdataId: string): Promise<boolean> => {
  const result = await connection.camelDb
    .deleteFrom('flight.aircraftNavdata')
    .where('navdataId', '=', navdataId)
    .executeTakeFirst()

  return result.numDeletedRows === 1n
}

// updaterName is the raw-sql concat alias, not a column on the table.
const mapRecord = (
  record: CamelRow<'flight.aircraftNavdata'> & { updaterName?: string | null },
): Navdata => ({
  navdataId: record.navdataId,
  aircraftRegistration: record.aircraftRegistration,
  updaterMemberId: record.updaterMemberId,
  updaterName: record.updaterName ?? record.updaterMemberId,
  updateDate: record.updateDate,
  cycle: record.cycle,
  expires: record.expires,
  createdAt: record.createdAt?.toISOString(),
  createdBy: record.createdBy,
})
