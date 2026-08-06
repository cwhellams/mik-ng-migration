import { Router, type Request, type Response } from 'express'
import {
  DefectFilterSchema,
  CreateDefectSchema,
  UpdateDefectSchema,
  type Defect,
} from './models.ts'
import { getDefects, createDefect, updateDefect, getDefect } from '../../db/defect-queries.ts'
import { getAircraftHilEntry } from '../../db/aircraft-hil-queries.ts'
import { getMaintenanceNote } from '../../db/maintenance-note-queries.ts'
import { getAjlbLiveBaselineFlightMins } from '../../db/flight-log-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/', async (req: Request, res: Response<Defect[]>) => {
  const filters = DefectFilterSchema.parse(req.query)
  // ajlbSeqNo omitted: list every defect for the aircraft, e.g. for HIL creation
  const defects = await getDefects(filters.aircraftRegistration, filters.ajlbSeqNo)
  res.status(200).json(defects)
})

router.post('/', async (req: Request, res: Response<Defect>) => {
  const data = CreateDefectSchema.parse(req.body)
  const baseline = await getAjlbLiveBaselineFlightMins(data.aircraftRegistration, data.ajlbSeqNo)
  if (data.flightMins <= baseline) {
    return problem({
      status: 400,
      detail: 'flightMins must be after the last validated flight for this logbook',
    })
  }
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

  const defect = await getDefect(id)
  if (!defect) return problem({ status: 404, detail: 'Defect not found' })

  // rows isn't PATCH-able for defects (create-only, like flightId/flightMins),
  // so blankRowsAfter must be checked against the defect's already-persisted
  // rows value here -- a rows: 0 defect (e.g. an in-flight chip) can never
  // have blank spacer rows, per the DB's zero-rows-no-blank check constraint.
  if (data.blankRowsAfter !== undefined && data.blankRowsAfter > 0 && defect.rows === 0) {
    return problem({
      status: 400,
      detail: 'blankRowsAfter must be 0 when rows is 0',
    })
  }

  if (data.hilId !== undefined) {
    if (!isAdmin) {
      return problem({ status: 403, detail: 'Only admins can link a defect to a hold item' })
    }
    if (defect.status === 'RESOLVED') {
      return problem({
        status: 400,
        detail: 'Cannot change the hold item link on a resolved defect',
      })
    }
    if (data.hilId) {
      const hil = await getAircraftHilEntry(data.hilId)
      if (!hil || hil.aircraftRegistration !== defect.aircraftRegistration) {
        return problem({ status: 400, detail: 'Hold item belongs to a different aircraft' })
      }
    }
  }

  if (data.resolvedNoteId) {
    const note = await getMaintenanceNote(data.resolvedNoteId)
    if (!note || note.aircraftRegistration !== defect.aircraftRegistration) {
      return problem({ status: 400, detail: 'Maintenance note belongs to a different aircraft' })
    }
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
