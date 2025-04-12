import { Router, type Request, type Response } from 'express'

import type { Aircraft, AircraftListResponse } from './models.ts'
import { getAllAircraft, getAircraftByRegistration } from '../../db/aircraft-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'
import type { ErrorResponse } from '../response.ts'

// all aircarft routes are protected by aircraft permissions
export const router = Router()
router.use(validateUser(MIKPermissions.AIRCRAFT_USER, MIKPermissions.AIRCRAFT_ADMIN))

const isAircraftAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.AIRCRAFT_ADMIN) ?? false

// Get all aircraft
router.get('/', async (req: Request, res: Response<AircraftListResponse>) => {
  const aircrafts = await getAllAircraft(!isAircraftAdmin(req.user))
  res.status(200).json({ aircrafts })
})

// Get aircraft by registration
router.get(
  '/:registration',
  async (req: Request<{ registration: string }>, res: Response<Aircraft | ErrorResponse>) => {
    const aircraft = await getAircraftByRegistration(
      req.params.registration,
      !isAircraftAdmin(req.user),
    )

    if (!aircraft) {
      return res.status(404).json({ message: 'Aircraft not found' })
    }

    // Validate response data against schema

    res.status(200).json(aircraft)
  },
)
