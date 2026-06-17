import { Router, type Request, type Response } from 'express'
import {
  MaintenanceNoteFilterSchema,
  CreateMaintenanceNoteSchema,
  UpdateMaintenanceNoteSchema,
  type MaintenanceNote,
} from './models.ts'
import {
  getMaintenanceNotes,
  createMaintenanceNote,
  updateMaintenanceNote,
} from '../../db/maintenance-note-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/', async (req: Request, res: Response<MaintenanceNote[]>) => {
  const filters = MaintenanceNoteFilterSchema.parse(req.query)
  const notes = await getMaintenanceNotes(filters.aircraftRegistration, filters.ajlbSeqNo)
  res.status(200).json(notes)
})

router.post(
  '/',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request, res: Response<MaintenanceNote>) => {
    const data = CreateMaintenanceNoteSchema.parse(req.body)
    const note = await createMaintenanceNote(data, req.user!.memberId!)
    res.status(201).json(note)
  },
)

router.patch('/:id', async (req: Request<{ id: string }>, res: Response<MaintenanceNote>) => {
  const { id } = req.params
  const data = UpdateMaintenanceNoteSchema.parse(req.body)
  const isAdmin = req.user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN)
  const updated = await updateMaintenanceNote(
    id,
    data,
    req.user!.memberId!,
    isAdmin ? undefined : req.user!.memberId!,
  )
  if (!updated) return problem({ status: 404, detail: 'Maintenance note not found' })
  res.status(200).json(updated)
})

export default router
