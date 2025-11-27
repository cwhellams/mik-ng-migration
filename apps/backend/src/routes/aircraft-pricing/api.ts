import { Router, type Request, type Response } from 'express'
import {
  AircraftPricingFiltersSchema,
  CreateAircraftPricingSchema,
  UpdateAircraftPricingSchema,
  type AircraftPricing,
  type AircraftPricingFilters,
  type AircraftPricingListResponse,
} from './models.ts'
import {
  getAircraftPricing,
  insertAircraftPricing,
  updateAircraftPricing,
  deleteAircraftPricing,
} from '../../db/aircraft-pricing-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'

export const router = Router()

// GET endpoint - accessible to any authenticated user with valid JWT
router.use(validateUser())

// Get aircraft pricing with flexible filters
// Query params:
// - registration: Filter by aircraft registration
// - fromDate: Get pricing valid from this date onwards
// - toDate: Get pricing valid up to this date
// Examples:
// - GET /api/v1/aircraft-pricing?registration=OH-STL (all pricing for OH-STL)
// - GET /api/v1/aircraft-pricing?registration=OH-STL&fromDate=2025-01-01 (current and future pricing)
// - GET /api/v1/aircraft-pricing?fromDate=2025-01-01&toDate=2025-12-31 (pricing for 2025)
router.get(
  '/',
  async (
    req: Request<{}, {}, {}, AircraftPricingFilters>,
    res: Response<AircraftPricingListResponse>,
  ) => {
    const filters = AircraftPricingFiltersSchema.parse(req.query)
    const pricing = await getAircraftPricing(filters)
    res.status(200).json({ pricing })
  },
)

// POST, PATCH, DELETE endpoints - require INVOICING_ADMIN or AIRCRAFT_ADMIN
router.use(validateUser(MIKPermissions.INVOICING_ADMIN, MIKPermissions.AIRCRAFT_ADMIN))

// Create new aircraft pricing
router.post('/', async (req: Request, res: Response<AircraftPricing>) => {
  const data = CreateAircraftPricingSchema.parse(req.body)

  data.created_by = req.user!.memberId

  const pricing = await insertAircraftPricing(data)
  res.status(201).json(pricing)
})

// Update aircraft pricing by registration and valid_from
router.patch(
  '/:registration/:validFrom',
  async (
    req: Request<{ registration: string; validFrom: string }>,
    res: Response<AircraftPricing>,
  ) => {
    const data = UpdateAircraftPricingSchema.parse(req.body)

    data.updated_by = req.user!.memberId

    const pricing = await updateAircraftPricing(req.params.registration, req.params.validFrom, data)
    res.status(200).json(pricing)
  },
)

// Delete aircraft pricing by registration and valid_from
router.delete(
  '/:registration/:validFrom',
  async (req: Request<{ registration: string; validFrom: string }>, res: Response) => {
    await deleteAircraftPricing(req.params.registration, req.params.validFrom)
    res.status(204).end()
  },
)
