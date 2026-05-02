import * as connection from './connection.ts'
import type {
  AircraftCard,
  AircraftCardAuditable,
  AircraftCardFilters,
  AircraftCardPatch,
} from '../routes/aircraft-cards/models.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'

export const getAllAircraftCards = async (
  filters: Partial<AircraftCardFilters> = {},
): Promise<AircraftCardAuditable[]> => {
  const { aircraftRegistration, validOnly = false, limit = 100, offset = 0 } = filters

  let query = connection.db
    .selectFrom('flight.aircraft_cards')
    .selectAll()
    .orderBy('valid_to', 'asc')
    .orderBy('name', 'asc')

  if (aircraftRegistration) {
    query = query.where('aircraft_registration', '=', aircraftRegistration)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    query = query.where((eb: any) =>
      eb.and([
        eb.or([eb('valid_from', 'is', null), eb('valid_from', '<=', now)]),
        eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', now)]),
      ]),
    )
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map((record: any) => mapRecord(record))
}

export const countAircraftCards = async (
  filters: Partial<AircraftCardFilters> = {},
): Promise<number> => {
  const { aircraftRegistration, validOnly = false } = filters

  let query = connection.db
    .selectFrom('flight.aircraft_cards')
    .select((eb: any) => eb.fn.count('card_id').as('count'))

  if (aircraftRegistration) {
    query = query.where('aircraft_registration', '=', aircraftRegistration)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0]
    query = query.where((eb: any) =>
      eb.and([
        eb.or([eb('valid_from', 'is', null), eb('valid_from', '<=', now)]),
        eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', now)]),
      ]),
    )
  }

  const result = await query.executeTakeFirst()
  return Number((result as any)?.count || 0)
}

export const getAircraftCardById = async (
  cardId: number,
): Promise<AircraftCardAuditable | null> => {
  const record = await connection.db
    .selectFrom('flight.aircraft_cards')
    .selectAll()
    .where('card_id', '=', cardId)
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
    .insertInto('flight.aircraft_cards')
    .values({
      aircraft_registration: card.aircraftRegistration,
      name: card.name,
      description: card.description || null,
      valid_from: card.validFrom || null,
      valid_to: card.validTo || null,
      created_at: now,
      created_by: jwt.memberId,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .returning('card_id')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Aircraft card insert failed' })
  }

  return {
    ...card,
    cardId: result.card_id,
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

  const updateData: any = {
    updated_at: now,
    updated_by: jwt.memberId,
  }

  if (patch.name !== undefined) updateData.name = patch.name
  if (patch.description !== undefined) updateData.description = patch.description
  if (patch.validFrom !== undefined) updateData.valid_from = patch.validFrom
  if (patch.validTo !== undefined) updateData.valid_to = patch.validTo

  const result = await connection.db
    .updateTable('flight.aircraft_cards')
    .set(updateData)
    .where('card_id', '=', cardId)
    .executeTakeFirst()

  return result.numUpdatedRows == BigInt(1)
}

export const removeAircraftCard = async (cardId: number): Promise<boolean> => {
  const result = await connection.db
    .deleteFrom('flight.aircraft_cards')
    .where('card_id', '=', cardId)
    .executeTakeFirst()

  return result.numDeletedRows == BigInt(1)
}

const mapRecord = (record: any): AircraftCardAuditable => ({
  cardId: record.card_id,
  aircraftRegistration: record.aircraft_registration,
  name: record.name,
  description: record.description,
  validFrom: record.valid_from || null,
  validTo: record.valid_to || null,
  createdAt: record.created_at?.toISOString(),
  updatedAt: record.updated_at?.toISOString(),
  createdBy: record.created_by,
  updatedBy: record.updated_by,
})
