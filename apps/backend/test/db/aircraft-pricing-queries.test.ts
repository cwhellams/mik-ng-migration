import 'dotenv/config'
import {
  getAircraftPricing,
  insertAircraftPricing,
  updateAircraftPricing,
  deleteAircraftPricing,
} from '../../src/db/aircraft-pricing-queries.ts'
import type {
  CreateAircraftPricing,
  UpdateAircraftPricing,
} from '../../src/routes/aircraft-pricing/models.ts'
import { db } from '../../src/db/connection.ts'

describe('Aircraft Pricing Queries', () => {
  const testRegistration = 'OH-STL'
  const testMemberId = 'k1mnimda'

  describe('getAircraftPricing', () => {
    it('should return all pricing when no filters provided', async () => {
      const pricing = await getAircraftPricing({})
      expect(pricing).toBeDefined()
      expect(Array.isArray(pricing)).toBe(true)
      expect(pricing.length).toBeGreaterThan(0)
    })

    it('should filter pricing by registration', async () => {
      const pricing = await getAircraftPricing({ registration: testRegistration })
      expect(pricing).toBeDefined()
      expect(Array.isArray(pricing)).toBe(true)
      pricing.forEach(p => {
        expect(p.registration).toBe(testRegistration)
      })
    })

    it('should filter pricing by fromDate', async () => {
      const fromDate = '2025-01-01'
      const pricing = await getAircraftPricing({ fromDate })
      expect(pricing).toBeDefined()
      expect(Array.isArray(pricing)).toBe(true)
      pricing.forEach(p => {
        // Either valid_from >= fromDate OR valid_to >= fromDate (or null)
        const startsAfter = p.valid_from >= fromDate
        const endsAfter = !p.valid_to || p.valid_to >= fromDate
        expect(startsAfter || endsAfter).toBe(true)
      })
    })

    it('should filter pricing by toDate', async () => {
      const toDate = '2025-12-31'
      const pricing = await getAircraftPricing({ toDate })
      expect(pricing).toBeDefined()
      expect(Array.isArray(pricing)).toBe(true)
      pricing.forEach(p => {
        expect(p.valid_from <= toDate).toBe(true)
      })
    })

    it('should filter pricing by date range', async () => {
      const fromDate = '2025-01-01'
      const toDate = '2025-12-31'
      const pricing = await getAircraftPricing({ fromDate, toDate })
      expect(pricing).toBeDefined()
      expect(Array.isArray(pricing)).toBe(true)
    })

    it('should filter pricing by registration and date range', async () => {
      const pricing = await getAircraftPricing({
        registration: testRegistration,
        fromDate: '2025-01-01',
        toDate: '2025-12-31',
      })
      expect(pricing).toBeDefined()
      expect(Array.isArray(pricing)).toBe(true)
      pricing.forEach(p => {
        expect(p.registration).toBe(testRegistration)
      })
    })

    it('should return pricing with all required fields', async () => {
      const pricing = await getAircraftPricing({ registration: testRegistration })
      expect(pricing.length).toBeGreaterThan(0)
      const first = pricing[0]
      expect(first).toHaveProperty('registration')
      expect(first).toHaveProperty('valid_from')
      expect(first).toHaveProperty('valid_to')
      expect(first).toHaveProperty('price_per_min')
      expect(first).toHaveProperty('created_at')
      expect(first).toHaveProperty('created_by')
      expect(first).toHaveProperty('updated_at')
      expect(first).toHaveProperty('updated_by')
      expect(first).toHaveProperty('notes')
      expect(typeof first.price_per_min).toBe('number')
    })
  })

  describe('insertAircraftPricing', () => {
    const testPricing: CreateAircraftPricing = {
      registration: 'OH-IHQ',
      valid_from: '2026-01-01',
      valid_to: null,
      price_per_min: 4.5,
      created_by: testMemberId,
      notes: 'Test pricing insert',
    }

    afterEach(async () => {
      // Clean up test data
      await db
        .deleteFrom('accts.aircraft_pricing')
        .where('registration', '=', testPricing.registration)
        .where('valid_from', '=', testPricing.valid_from)
        .execute()
    })

    it('should insert new pricing record', async () => {
      const result = await insertAircraftPricing(testPricing)
      expect(result).toBeDefined()
      expect(result.registration).toBe(testPricing.registration)
      expect(result.valid_from).toBe(testPricing.valid_from)
      expect(result.price_per_min).toBe(testPricing.price_per_min)
      expect(result.created_by).toBe(testMemberId)
      expect(result.notes).toBe(testPricing.notes)
    })

    it('should auto-close existing open pricing when inserting new pricing', async () => {
      // Get current pricing for OH-IHQ
      const currentPricing = await getAircraftPricing({
        registration: 'OH-IHQ',
        fromDate: '2025-01-01',
      })
      const openPricing = currentPricing.find(p => p.valid_to === null)

      // Insert new pricing
      const result = await insertAircraftPricing(testPricing)
      expect(result.valid_to).toBeNull()

      // Check that old pricing was closed
      if (openPricing) {
        const updatedOldPricing = await getAircraftPricing({
          registration: 'OH-IHQ',
          fromDate: openPricing.valid_from,
          toDate: openPricing.valid_from,
        })
        const closed = updatedOldPricing.find(p => p.valid_from === openPricing.valid_from)
        expect(closed?.valid_to).toBe('2025-12-31') // Should be '2025-12-31', the day before new pricing starts ('2026-01-01')
      }
    })

    it('should throw error for invalid registration', async () => {
      const invalidPricing = {
        ...testPricing,
        registration: 'INVALID',
      }
      await expect(insertAircraftPricing(invalidPricing)).rejects.toThrow()
    })

    it('should throw error for duplicate pricing period', async () => {
      await insertAircraftPricing(testPricing)
      await expect(insertAircraftPricing(testPricing)).rejects.toThrow()
    })
  })

  describe('updateAircraftPricing', () => {
    it('should update pricing valid_to date', async () => {
      const pricing = await getAircraftPricing({ registration: testRegistration })
      const toUpdate = pricing[0]

      const update: UpdateAircraftPricing = {
        valid_to: '2026-02-28',
        updated_by: testMemberId,
      }

      const result = await updateAircraftPricing(toUpdate.registration, toUpdate.valid_from, update)

      expect(result.valid_to).toBe(update.valid_to)
      expect(result.updated_by).toBe(testMemberId)
      expect(result.updated_at).toBeDefined()
    })

    it('should update pricing amount', async () => {
      const pricing = await getAircraftPricing({ registration: testRegistration })
      const toUpdate = pricing[0]
      const originalPrice = toUpdate.price_per_min

      const update: UpdateAircraftPricing = {
        price_per_min: originalPrice + 0.5,
        updated_by: testMemberId,
      }

      const result = await updateAircraftPricing(toUpdate.registration, toUpdate.valid_from, update)

      expect(result.price_per_min).toBe(update.price_per_min)

      // Restore original price
      await updateAircraftPricing(toUpdate.registration, toUpdate.valid_from, {
        price_per_min: originalPrice,
      })
    })

    it('should update notes', async () => {
      const pricing = await getAircraftPricing({ registration: testRegistration })
      const toUpdate = pricing[0]
      const originalNotes = toUpdate.notes

      const update: UpdateAircraftPricing = {
        notes: 'Updated test notes',
        updated_by: testMemberId,
      }

      const result = await updateAircraftPricing(toUpdate.registration, toUpdate.valid_from, update)

      expect(result.notes).toBe(update.notes)

      // Restore original notes
      await updateAircraftPricing(toUpdate.registration, toUpdate.valid_from, {
        notes: originalNotes ?? undefined,
      })
    })

    it('should throw error for non-existent pricing', async () => {
      const update: UpdateAircraftPricing = {
        valid_to: '2025-12-31',
      }

      await expect(updateAircraftPricing('OH-STL', '1999-01-01', update)).rejects.toThrow()
    })
  })

  describe('deleteAircraftPricing', () => {
    it('should delete the most recent pricing record', async () => {
      // Create a new open-ended pricing for OH-IHQ (will auto-close existing)
      const testPricing: CreateAircraftPricing = {
        registration: 'OH-IHQ',
        valid_from: '2028-01-01',
        valid_to: null,
        price_per_min: 5.0,
        created_by: testMemberId,
        notes: 'Test pricing for deletion',
      }

      const inserted = await insertAircraftPricing(testPricing)

      // Delete it (this is the most recent, so deleting re-opens the previous period)
      await deleteAircraftPricing(inserted.registration, inserted.valid_from)

      // Verify it's gone
      const pricing = await getAircraftPricing({
        registration: inserted.registration,
        fromDate: inserted.valid_from,
      })
      const deleted = pricing.find(p => p.valid_from === inserted.valid_from)
      expect(deleted).toBeUndefined()
    })
    it('should throw error when deleting non-existent pricing', async () => {
      await expect(deleteAircraftPricing('OH-STL', '1999-01-01')).rejects.toThrow()
    })
  })

  describe('Database constraints and triggers', () => {
    it('should enforce positive price constraint', async () => {
      const invalidPricing: CreateAircraftPricing = {
        registration: 'OH-IHQ',
        valid_from: '2026-06-01',
        valid_to: null,
        price_per_min: -1.0, // Invalid negative price
        created_by: testMemberId,
      }

      await expect(insertAircraftPricing(invalidPricing)).rejects.toThrow()
    })

    it('should enforce valid date range constraint', async () => {
      const invalidPricing: CreateAircraftPricing = {
        registration: 'OH-IHQ',
        valid_from: '2026-12-31',
        valid_to: '2026-01-01', // valid_to before valid_from
        price_per_min: 4.0,
        created_by: testMemberId,
      }

      await expect(insertAircraftPricing(invalidPricing)).rejects.toThrow()
    })
  })
})
