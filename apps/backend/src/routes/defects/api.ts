import { Router, type Request, type Response } from 'express'
import {
  DefectFilterSchema,
  CreateDefectSchema,
  UpdateDefectSchema,
  type Defect,
} from './models.ts'
import { getDefects, createDefect, updateDefect } from '../../db/defect-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/', async (req: Request, res: Response<Defect[]>) => {
  const filters = DefectFilterSchema.parse(req.query)
  const defects = await getDefects(filters.aircraftRegistration, filters.ajlbSeqNo)
  res.status(200).json(defects)
})

router.post('/', async (req: Request, res: Response<Defect>) => {
  const data = CreateDefectSchema.parse(req.body)
  const defect = await createDefect(data, req.user!.memberId!)
  res.status(201).json(defect)
})

router.patch('/:id', async (req: Request<{ id: string }>, res: Response<Defect>) => {
  const { id } = req.params
  const data = UpdateDefectSchema.parse(req.body)
  const isAdmin = req.user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN)

  if (data.resolvedNoteId !== undefined && !isAdmin) {
    return problem({ status: 403, detail: 'Only admins can mark a defect as resolved' })
  }

  const updated = await updateDefect(
    id,
    data,
    req.user!.memberId!,
    isAdmin ? undefined : req.user!.memberId!,
  )
  if (!updated) return problem({ status: 404, detail: 'Defect not found' })
  res.status(200).json(updated)
})

export default router
