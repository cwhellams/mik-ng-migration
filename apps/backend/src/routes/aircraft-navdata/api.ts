import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  getAllNavdata,
  countNavdata,
  getNavdataById,
  addNavdata,
  removeNavdata,
} from '../../db/aircraft-navdata-queries.ts'
import { problem } from '../response.ts'
import {
  NavdataFiltersSchema,
  NavdataCreateSchema,
  type NavdataCreate,
  type Navdata,
  type NavdataFilters,
  type NavdataListResponse,
} from '@mik/contracts/aircraft-navdata'

export const router = Router()

// All navdata routes require at least AIRCRAFT_USER permission
router.use(validateUser(MIKPermissions.AIRCRAFT_USER, MIKPermissions.AIRCRAFT_ADMIN))

// Get all navdata records
router.get(
  '/',
  async (
    req: Request<never, NavdataListResponse, never, NavdataFilters>,
    res: Response<NavdataListResponse>,
  ) => {
    const filters = NavdataFiltersSchema.parse(req.query)

    const [records, total] = await Promise.all([getAllNavdata(filters), countNavdata(filters)])

    res.status(200).json({ records, total })
  },
)

// Get navdata record by ID
router.get('/:navdataId', async (req: Request<{ navdataId: string }>, res: Response<Navdata>) => {
  const { navdataId } = req.params

  const record = await getNavdataById(navdataId)
  if (!record) {
    return problem({ status: 404, detail: 'Navdata record not found' })
  }

  res.status(200).json(record)
})

// Create navdata record (admin only)
router.post(
  '/',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<never, Navdata, NavdataCreate>, res: Response<Navdata>) => {
    const data = NavdataCreateSchema.parse(req.body)
    const created = await addNavdata(data, req.user!)
    res.status(201).json(created)
  },
)

// Delete navdata record (admin only)
router.delete(
  '/:navdataId',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ navdataId: string }>, res: Response) => {
    const { navdataId } = req.params

    const removed = await removeNavdata(navdataId)
    if (!removed) {
      return problem({ status: 404, detail: 'Navdata record not found' })
    }

    res.status(204).end()
  },
)
