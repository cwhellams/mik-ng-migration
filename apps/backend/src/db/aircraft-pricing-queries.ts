import type { Updateable } from 'kysely'

import type { AcctsAircraftPricing } from '@mik/db-schema/schema'
import * as connection from './connection.ts'
import type {
  AircraftPricing,
  AircraftPricingFilters,
  CreateAircraftPricing,
  UpdateAircraftPricing,
} from '@mik/contracts/aircraft-pricing'
import { problem } from '../routes/response.ts'

/**
 * Get aircraft pricing records with optional filters
 * Filters:
 * - registration: Filter by aircraft registration
 * - fromDate: Get pricing where valid_from >= fromDate OR valid_to >= fromDate (pricing active from this date)
 * - toDate: Get pricing where valid_from <= toDate (pricing started before or on this date)
 */
export const getAircraftPricing = async (
  filters: Partial<AircraftPricingFilters> = {},
): Promise<AircraftPricing[]> => {
  const { registration, fromDate, toDate } = filters

  let query = connection.db
    .selectFrom('accts.aircraftPricing')
    .selectAll()
    .orderBy('registration', 'asc')
    .orderBy('validFrom', 'desc')

  if (registration) {
    query = query.where('registration', '=', registration)
  }

  if (fromDate) {
    // Get pricing that was/is valid on or after fromDate
    // Either the range starts on/after fromDate, or it ends on/after fromDate (or is still open)
    query = query.where((eb) =>
      eb.or([
        eb('validFrom', '>=', fromDate),
        eb.or([eb('validTo', 'is', null), eb('validTo', '>=', fromDate)]),
      ]),
    )
  }

  if (toDate) {
    // Get pricing that was valid on or before toDate
    // The range must have started on or before toDate
    query = query.where('validFrom', '<=', toDate)
  }

  const results = await query.execute()

  return results.map((row) => ({
    registration: row.registration,
    valid_from: row.validFrom,
    valid_to: row.validTo,
    price_per_min: Number(row.pricePerMin),
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy,
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
    updated_by: row.updatedBy,
    notes: row.notes,
  }))
}

/**
 * Insert a new aircraft pricing record
 * Note: The database trigger will automatically close any existing open pricing period
 * if the new valid_from is after it
 */
export const insertAircraftPricing = async (
  data: CreateAircraftPricing,
): Promise<AircraftPricing> => {
  try {
    const result = await connection.db
      .insertInto('accts.aircraftPricing')
      .values({
        registration: data.registration,
        validFrom: data.valid_from,
        validTo: data.valid_to ?? null,
        pricePerMin: data.price_per_min.toString(),
        createdBy: data.created_by ?? null,
        notes: data.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return {
      registration: result.registration,
      valid_from: result.validFrom,
      valid_to: result.validTo,
      price_per_min: Number(result.pricePerMin),
      created_at: result.createdAt.toISOString(),
      created_by: result.createdBy,
      updated_at: result.updatedAt ? result.updatedAt.toISOString() : null,
      updated_by: result.updatedBy,
      notes: result.notes,
    }
  } catch (error: any) {
    if (error.code === '23503') {
      // Foreign key violation
      problem({ status: 400, detail: 'Invalid aircraft registration or member ID' })
    }
    if (error.code === '23505') {
      // Unique constraint violation
      problem({ status: 409, detail: 'Pricing period already exists for this aircraft' })
    }
    if (error.message?.includes('overlaps')) {
      problem({ status: 409, detail: error.message })
    }
    if (error.message?.includes('gap')) {
      problem({ status: 400, detail: error.message })
    }
    throw error
  }
}

/**
 * Update an existing aircraft pricing record
 * Identified by registration and valid_from (composite primary key)
 */
export const updateAircraftPricing = async (
  registration: string,
  validFrom: string,
  data: UpdateAircraftPricing,
): Promise<AircraftPricing> => {
  try {
    // Updateable<> rather than `any`: the point of moving to camelCase is that the
    // compiler checks column names, and an `any` update object opts straight back out.
    const updateData: Updateable<AcctsAircraftPricing> = {
      updatedAt: new Date().toISOString(),
    }

    if (data.valid_to !== undefined) {
      updateData.validTo = data.valid_to
    }
    if (data.price_per_min !== undefined) {
      updateData.pricePerMin = data.price_per_min.toString()
    }
    if (data.updated_by !== undefined) {
      updateData.updatedBy = data.updated_by
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes
    }

    const result = await connection.db
      .updateTable('accts.aircraftPricing')
      .set(updateData)
      .where('registration', '=', registration)
      .where('validFrom', '=', validFrom)
      .returningAll()
      .executeTakeFirst()

    if (!result) {
      problem({ status: 404, detail: 'Aircraft pricing record not found' })
    }

    return {
      registration: result!.registration,
      valid_from: result!.validFrom,
      valid_to: result!.validTo,
      price_per_min: Number(result!.pricePerMin),
      created_at: result!.createdAt.toISOString(),
      created_by: result!.createdBy,
      updated_at: result!.updatedAt ? result!.updatedAt.toISOString() : null,
      updated_by: result!.updatedBy,
      notes: result!.notes,
    }
  } catch (error: any) {
    if (error.code === '23503') {
      problem({ status: 400, detail: 'Invalid member ID' })
    }
    if (error.message?.includes('overlaps')) {
      problem({ status: 409, detail: error.message })
    }
    if (error.message?.includes('gap')) {
      problem({ status: 400, detail: error.message })
    }
    throw error
  }
}

/**
 * Delete an aircraft pricing record
 * Identified by registration and valid_from (composite primary key)
 * Note: This should be used carefully as it may create gaps in pricing history
 */
export const deleteAircraftPricing = async (
  registration: string,
  validFrom: string,
): Promise<void> => {
  const result = await connection.db
    .deleteFrom('accts.aircraftPricing')
    .where('registration', '=', registration)
    .where('validFrom', '=', validFrom)
    .executeTakeFirst()

  if (result.numDeletedRows === 0n) {
    problem({ status: 404, detail: 'Aircraft pricing record not found' })
  }
}

/**
 * Get all pricing history for a specific aircraft
 */
export const getAircraftPricingHistory = async (
  registration: string,
): Promise<AircraftPricing[]> => {
  const results = await connection.db
    .selectFrom('accts.aircraftPricing')
    .selectAll()
    .where('registration', '=', registration)
    .orderBy('validFrom', 'desc')
    .execute()

  return results.map((row) => ({
    registration: row.registration,
    valid_from: row.validFrom,
    valid_to: row.validTo,
    price_per_min: Number(row.pricePerMin),
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy,
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
    updated_by: row.updatedBy,
    notes: row.notes,
  }))
}

/**
 * Get the price per minute for a specific aircraft on a specific date
 * Returns the pricing record that was valid on the given date
 * Returns null if no pricing found for that date
 */
export const getAircraftPriceForDate = async (
  registration: string,
  date: string, // YYYY-MM-DD format
): Promise<number | null> => {
  const result = await connection.db
    .selectFrom('accts.aircraftPricing')
    .select('pricePerMin')
    .where('registration', '=', registration)
    .where('validFrom', '<=', date)
    .where((eb) => eb.or([eb('validTo', 'is', null), eb('validTo', '>=', date)]))
    .executeTakeFirst()

  return result ? Number(result.pricePerMin) : null
}
