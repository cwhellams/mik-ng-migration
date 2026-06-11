import * as connection from './connection.ts'
import type {
  AircraftPricing,
  AircraftPricingFilters,
  CreateAircraftPricing,
  UpdateAircraftPricing,
} from '../routes/aircraft-pricing/models.ts'
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
    .selectFrom('accts.aircraft_pricing')
    .selectAll()
    .orderBy('registration', 'asc')
    .orderBy('valid_from', 'desc')

  if (registration) {
    query = query.where('registration', '=', registration)
  }

  if (fromDate) {
    // Get pricing that was/is valid on or after fromDate
    // Either the range starts on/after fromDate, or it ends on/after fromDate (or is still open)
    query = query.where((eb: any) =>
      eb.or([
        eb('valid_from', '>=', fromDate),
        eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', fromDate)]),
      ]),
    )
  }

  if (toDate) {
    // Get pricing that was valid on or before toDate
    // The range must have started on or before toDate
    query = query.where('valid_from', '<=', toDate)
  }

  const results = await query.execute()

  return results.map((row) => ({
    registration: row.registration,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    price_per_min: Number(row.price_per_min),
    created_at: row.created_at.toISOString(),
    created_by: row.created_by,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    updated_by: row.updated_by,
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
      .insertInto('accts.aircraft_pricing')
      .values({
        registration: data.registration,
        valid_from: data.valid_from,
        valid_to: data.valid_to ?? null,
        price_per_min: data.price_per_min.toString(),
        created_by: data.created_by ?? null,
        notes: data.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return {
      registration: result.registration,
      valid_from: result.valid_from,
      valid_to: result.valid_to,
      price_per_min: Number(result.price_per_min),
      created_at: result.created_at.toISOString(),
      created_by: result.created_by,
      updated_at: result.updated_at ? result.updated_at.toISOString() : null,
      updated_by: result.updated_by,
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
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (data.valid_to !== undefined) {
      updateData.valid_to = data.valid_to
    }
    if (data.price_per_min !== undefined) {
      updateData.price_per_min = data.price_per_min.toString()
    }
    if (data.updated_by !== undefined) {
      updateData.updated_by = data.updated_by
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes
    }

    const result = await connection.db
      .updateTable('accts.aircraft_pricing')
      .set(updateData)
      .where('registration', '=', registration)
      .where('valid_from', '=', validFrom)
      .returningAll()
      .executeTakeFirst()

    if (!result) {
      problem({ status: 404, detail: 'Aircraft pricing record not found' })
    }

    return {
      registration: result!.registration,
      valid_from: result!.valid_from,
      valid_to: result!.valid_to,
      price_per_min: Number(result!.price_per_min),
      created_at: result!.created_at.toISOString(),
      created_by: result!.created_by,
      updated_at: result!.updated_at ? result!.updated_at.toISOString() : null,
      updated_by: result!.updated_by,
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
    .deleteFrom('accts.aircraft_pricing')
    .where('registration', '=', registration)
    .where('valid_from', '=', validFrom)
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
    .selectFrom('accts.aircraft_pricing')
    .selectAll()
    .where('registration', '=', registration)
    .orderBy('valid_from', 'desc')
    .execute()

  return results.map((row) => ({
    registration: row.registration,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    price_per_min: Number(row.price_per_min),
    created_at: row.created_at.toISOString(),
    created_by: row.created_by,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    updated_by: row.updated_by,
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
    .selectFrom('accts.aircraft_pricing')
    .select('price_per_min')
    .where('registration', '=', registration)
    .where('valid_from', '<=', date)
    .where((eb: any) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', date)]))
    .executeTakeFirst()

  return result ? Number(result.price_per_min) : null
}
