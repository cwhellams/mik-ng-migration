import * as connection from './connection.ts'
import { sql } from 'kysely'
import type { Navdata, NavdataCreate, NavdataFilters } from '@mik/contracts/aircraft-navdata'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'

export const getAllNavdata = async (filters: Partial<NavdataFilters> = {}): Promise<Navdata[]> => {
  const { aircraftRegistration, limit = 100, offset = 0 } = filters

  let query = connection.db
    .selectFrom('flight.aircraft_navdata as nd')
    .leftJoin('member.register as m', 'm.member_id', 'nd.updater_member_id')
    .select([
      'nd.navdata_id',
      'nd.aircraft_registration',
      'nd.updater_member_id',
      sql<string>`trim(concat(m.first_name, ' ', m.last_name))`.as('updater_name'),
      'nd.update_date',
      'nd.cycle',
      'nd.expires',
      'nd.created_at',
      'nd.created_by',
    ])
    .orderBy('nd.update_date', 'desc')
    .orderBy('nd.navdata_id', 'desc')

  if (aircraftRegistration) {
    query = query.where('nd.aircraft_registration', '=', aircraftRegistration)
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map((r: any) => mapRecord(r))
}

export const countNavdata = async (filters: Partial<NavdataFilters> = {}): Promise<number> => {
  const { aircraftRegistration } = filters

  let query = connection.db
    .selectFrom('flight.aircraft_navdata')
    .select((eb: any) => eb.fn.count('navdata_id').as('count'))

  if (aircraftRegistration) {
    query = query.where('aircraft_registration', '=', aircraftRegistration)
  }

  const result = await query.executeTakeFirst()
  return Number((result as any)?.count || 0)
}

export const getLatestNavdata = async (aircraftRegistration: string): Promise<Navdata | null> => {
  const record = await connection.db
    .selectFrom('flight.aircraft_navdata as nd')
    .leftJoin('member.register as m', 'm.member_id', 'nd.updater_member_id')
    .select([
      'nd.navdata_id',
      'nd.aircraft_registration',
      'nd.updater_member_id',
      sql<string>`trim(concat(m.first_name, ' ', m.last_name))`.as('updater_name'),
      'nd.update_date',
      'nd.cycle',
      'nd.expires',
      'nd.created_at',
      'nd.created_by',
    ])
    .where('nd.aircraft_registration', '=', aircraftRegistration)
    .orderBy('nd.update_date', 'desc')
    .orderBy('nd.navdata_id', 'desc')
    .limit(1)
    .executeTakeFirst()

  if (!record) return null
  return mapRecord(record)
}

export const addNavdata = async (data: NavdataCreate, jwt: JWTUser): Promise<Navdata> => {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraft_navdata')
    .values({
      aircraft_registration: data.aircraftRegistration,
      updater_member_id: data.updaterMemberId,
      update_date: data.updateDate,
      cycle: data.cycle,
      expires: data.expires,
      created_at: now,
      created_by: jwt.memberId,
    })
    .returning('navdata_id')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Navdata insert failed' })
  }

  const inserted = await getNavdataById(result.navdata_id)
  if (!inserted) {
    return problem({ status: 500, detail: 'Navdata not found after insert' })
  }
  return inserted
}

export const getNavdataById = async (navdataId: string): Promise<Navdata | null> => {
  const record = await connection.db
    .selectFrom('flight.aircraft_navdata as nd')
    .leftJoin('member.register as m', 'm.member_id', 'nd.updater_member_id')
    .select([
      'nd.navdata_id',
      'nd.aircraft_registration',
      'nd.updater_member_id',
      sql<string>`trim(concat(m.first_name, ' ', m.last_name))`.as('updater_name'),
      'nd.update_date',
      'nd.cycle',
      'nd.expires',
      'nd.created_at',
      'nd.created_by',
    ])
    .where('nd.navdata_id', '=', navdataId)
    .executeTakeFirst()

  if (!record) return null
  return mapRecord(record)
}

export const removeNavdata = async (navdataId: string): Promise<boolean> => {
  const result = await connection.db
    .deleteFrom('flight.aircraft_navdata')
    .where('navdata_id', '=', navdataId)
    .executeTakeFirst()

  return result.numDeletedRows === 1n
}

const mapRecord = (record: any): Navdata => ({
  navdataId: record.navdata_id,
  aircraftRegistration: record.aircraft_registration,
  updaterMemberId: record.updater_member_id,
  updaterName: record.updater_name ?? record.updater_member_id,
  updateDate: record.update_date,
  cycle: record.cycle,
  expires: record.expires,
  createdAt: record.created_at?.toISOString(),
  createdBy: record.created_by,
})
