import type { Updateable } from 'kysely'

import type { FlightAircraftCards } from './schema.d.ts'
import type { DbRow } from './connection.ts'
import * as connection from './connection.ts'
import type {
  AircraftCard,
  AircraftCardAuditable,
  AircraftCardFilters,
  AircraftCardPatch,
} from '@mik/contracts/aircraft-cards'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'

export const getAllAircraftCards = async (
  filters: Partial<AircraftCardFilters> = {},
): Promise<AircraftCardAuditable[]> => {
  const { aircraftRegistration, validOnly = false, limit = 100, offset = 0 } = filters

  let query = connection.db
    .selectFrom('flight.aircraftCards')
    .selectAll()
    .orderBy('validTo', 'asc')
    .orderBy('name', 'asc')

  if (aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', aircraftRegistration)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    query = query.where((eb) =>
      eb.and([
        eb.or([eb('validFrom', 'is', null), eb('validFrom', '<=', now)]),
        eb.or([eb('validTo', 'is', null), eb('validTo', '>=', now)]),
      ]),
    )
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map(mapRecord)
}

export const countAircraftCards = async (
  filters: Partial<AircraftCardFilters> = {},
): Promise<number> => {
  const { aircraftRegistration, validOnly = false } = filters

  let query = connection.db
    .selectFrom('flight.aircraftCards')
    .select((eb) => eb.fn.count('cardId').as('count'))

  if (aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', aircraftRegistration)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0]
    query = query.where((eb) =>
      eb.and([
        eb.or([eb('validFrom', 'is', null), eb('validFrom', '<=', now)]),
        eb.or([eb('validTo', 'is', null), eb('validTo', '>=', now)]),
      ]),
    )
  }

  const result = await query.executeTakeFirst()
  return Number(result?.count ?? 0)
}

export const getAircraftCardById = async (
  cardId: number,
): Promise<AircraftCardAuditable | null> => {
  const record = await connection.db
    .selectFrom('flight.aircraftCards')
    .selectAll()
    .where('cardId', '=', cardId)
    .executeTakeFirst()

  if (!record) return null

  return mapRecord(record)
}

export const addAircraftCard = async (
  card: AircraftCard,
  jwt: JWTUser,
): Promise<AircraftCardAuditable> => {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraftCards')
    .values({
      aircraftRegistration: card.aircraftRegistration,
      name: card.name,
      description: card.description || null,
      validFrom: card.validFrom || null,
      validTo: card.validTo || null,
      createdAt: now,
      createdBy: jwt.memberId,
      updatedAt: now,
      updatedBy: jwt.memberId,
    })
    .returning('cardId')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Aircraft card insert failed' })
  }

  return {
    ...card,
    cardId: result.cardId,
    createdAt: now.toISOString(),
    createdBy: jwt.memberId,
    updatedAt: now.toISOString(),
    updatedBy: jwt.memberId,
  }
}

export const updateAircraftCard = async (
  cardId: number,
  patch: AircraftCardPatch,
  jwt: JWTUser,
): Promise<boolean> => {
  const now = new Date()

  const updateData: Updateable<FlightAircraftCards> = {
    updatedAt: now,
    updatedBy: jwt.memberId,
  }

  if (patch.name !== undefined) updateData.name = patch.name
  if (patch.description !== undefined) updateData.description = patch.description
  if (patch.validFrom !== undefined) updateData.validFrom = patch.validFrom
  if (patch.validTo !== undefined) updateData.validTo = patch.validTo

  const result = await connection.db
    .updateTable('flight.aircraftCards')
    .set(updateData)
    .where('cardId', '=', cardId)
    .executeTakeFirst()

  return result.numUpdatedRows == BigInt(1)
}

export const removeAircraftCard = async (cardId: number): Promise<boolean> => {
  const result = await connection.db
    .deleteFrom('flight.aircraftCards')
    .where('cardId', '=', cardId)
    .executeTakeFirst()

  return result.numDeletedRows == BigInt(1)
}

const mapRecord = (record: DbRow<'flight.aircraftCards'>): AircraftCardAuditable => ({
  cardId: record.cardId,
  aircraftRegistration: record.aircraftRegistration,
  name: record.name,
  description: record.description,
  validFrom: record.validFrom || null,
  validTo: record.validTo || null,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString(),
  createdBy: record.createdBy,
  updatedBy: record.updatedBy,
})
