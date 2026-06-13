import { Router, type Request, type Response } from 'express'
import {
  AircraftHilFilterSchema,
  CreateAircraftHilSchema,
  UpdateAircraftHilSchema,
  CreateAircraftHilExtensionSchema,
  type AircraftHil,
  type AircraftHilExtension,
} from './models.ts'
import {
  getAircraftHilEntries,
  createAircraftHilEntry,
  updateAircraftHilEntry,
  getAircraftHilExtensions,
  createAircraftHilExtension,
  getAircraftHilEntry,
} from '../../db/aircraft-hil-queries.ts'
import { resolveDefectsByHil } from '../../db/defect-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/', async (req: Request, res: Response<AircraftHil[]>) => {
  const filters = AircraftHilFilterSchema.parse(req.query)
  const entries = await getAircraftHilEntries(filters.aircraftRegistration)
  res.status(200).json(entries)
})

router.post('/', async (req: Request, res: Response<AircraftHil>) => {
  const data = CreateAircraftHilSchema.parse(req.body)
  const entry = await createAircraftHilEntry(data, req.user!.memberId!)
  res.status(201).json(entry)
})

router.patch(
  '/:id',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ id: string }>, res: Response<AircraftHil>) => {
    const { id } = req.params
    const data = UpdateAircraftHilSchema.parse(req.body)
    const updated = await updateAircraftHilEntry(id, data, req.user!.memberId!)
    if (!updated) return problem({ status: 404, detail: 'HIL entry not found' })

    if (data.resolvedNoteId) {
      await resolveDefectsByHil(id, data.resolvedNoteId, req.user!.memberId!)
    }

    res.status(200).json(updated)
  },
)

router.get('/:id/extensions', async (req: Request<{ id: string }>, res: Response<AircraftHilExtension[]>) => {
  const { id } = req.params
  const hil = await getAircraftHilEntry(id)
  if (!hil) return problem({ status: 404, detail: 'HIL entry not found' })
  const extensions = await getAircraftHilExtensions(id)
  res.status(200).json(extensions)
})

router.post(
  '/:id/extensions',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ id: string }>, res: Response<AircraftHilExtension>) => {
    const { id } = req.params
    const hil = await getAircraftHilEntry(id)
    if (!hil) return problem({ status: 404, detail: 'HIL entry not found' })
    const data = CreateAircraftHilExtensionSchema.parse(req.body)
    const extension = await createAircraftHilExtension(id, data, req.user!.memberId!)
    res.status(201).json(extension)
  },
)

export default router
