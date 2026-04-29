import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  getAllAircraftCards,
  countAircraftCards,
  getAircraftCardById,
  addAircraftCard,
  updateAircraftCard,
  removeAircraftCard,
} from '../../db/aircraft-card-queries.ts'
import { problem } from '../response.ts'
import {
  AircraftCardFiltersSchema,
  AircraftCardSchema,
  type AircraftCard,
  type AircraftCardAuditable,
  type AircraftCardFilters,
  type AircraftCardListResponse,
} from './models.ts'

export const router = Router()

// All aircraft card routes require at least AIRCRAFT_USER permission
router.use(validateUser(MIKPermissions.AIRCRAFT_USER, MIKPermissions.AIRCRAFT_ADMIN))

// Get all aircraft cards
router.get(
  '/',
  async (
    req: Request<never, AircraftCardListResponse, never, AircraftCardFilters>,
    res: Response<AircraftCardListResponse>,
  ) => {
    const filters = AircraftCardFiltersSchema.parse(req.query)

    const [cards, total] = await Promise.all([
      getAllAircraftCards(filters),
      countAircraftCards(filters),
    ])

    res.status(200).json({ cards, total })
  },
)

// Get aircraft card by ID
router.get(
  '/:cardId',
  async (req: Request<{ cardId: string }>, res: Response<AircraftCardAuditable>) => {
    const cardId = Number.parseInt(req.params.cardId, 10)
    if (Number.isNaN(cardId)) {
      return problem({ status: 400, detail: 'Invalid card ID' })
    }

    const card = await getAircraftCardById(cardId)
    if (!card) {
      return problem({ status: 404, detail: 'Aircraft card not found' })
    }

    res.status(200).json(card)
  },
)

// Create aircraft card (admin only)
router.post(
  '/',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (
    req: Request<never, AircraftCardAuditable, AircraftCard>,
    res: Response<AircraftCardAuditable>,
  ) => {
    const card = AircraftCardSchema.parse(req.body)
    const created = await addAircraftCard(card, req.user!)
    res.status(201).json(created)
  },
)

// Update aircraft card (admin only)
router.patch(
  '/:cardId',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ cardId: string }>, res: Response<AircraftCardAuditable>) => {
    const cardId = Number.parseInt(req.params.cardId, 10)
    if (Number.isNaN(cardId)) {
      return problem({ status: 400, detail: 'Invalid card ID' })
    }

    const patch = AircraftCardSchema.partial().parse(req.body)
    const success = await updateAircraftCard(cardId, patch, req.user!)

    if (!success) {
      return problem({ status: 404, detail: 'Aircraft card not found' })
    }

    const updated = await getAircraftCardById(cardId)
    if (!updated) {
      return problem({ status: 404, detail: 'Aircraft card not found after update' })
    }

    res.status(200).json(updated)
  },
)

// Delete aircraft card (admin only)
router.delete(
  '/:cardId',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ cardId: string }>, res: Response) => {
    const cardId = Number.parseInt(req.params.cardId, 10)
    if (Number.isNaN(cardId)) {
      return problem({ status: 400, detail: 'Invalid card ID' })
    }

    const removed = await removeAircraftCard(cardId)
    if (!removed) {
      return problem({ status: 404, detail: 'Aircraft card not found' })
    }

    res.status(204).end()
  },
)
