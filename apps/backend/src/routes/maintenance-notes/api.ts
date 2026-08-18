import { Router, type Request, type Response } from 'express'
import {
  MaintenanceNoteFilterSchema,
  CreateMaintenanceNoteSchema,
  UpdateMaintenanceNoteSchema,
  type MaintenanceNote,
} from '@mik/contracts/maintenance-notes'
import {
  getMaintenanceNotes,
  getMaintenanceNote,
  createMaintenanceNote,
  updateMaintenanceNote,
} from '../../db/maintenance-note-queries.ts'
import { getAjlbLiveBaselineFlightMins } from '../../db/flight-log-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
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
    const baseline = await getAjlbLiveBaselineFlightMins(data.aircraftRegistration, data.ajlbSeqNo)
    // Notes are never tied to a specific flight, so their time describes "right now" and
    // may legitimately equal the baseline exactly (e.g. found before any new flight has
    // flown since the last validated one) -- only earlier than the baseline is rejected.
    if (data.flightMins < baseline) {
      return problem({
        status: 400,
        detail: "This time can't be earlier than the logbook's last validated flight",
      })
    }
    const note = await createMaintenanceNote(data, req.user!.memberId!)
    res.status(201).json(note)
  },
)

router.patch('/:id', async (req: Request<{ id: string }>, res: Response<MaintenanceNote>) => {
  const { id } = req.params
  const data = UpdateMaintenanceNoteSchema.parse(req.body)
  const isAdmin = req.user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN)

  const existing = await getMaintenanceNote(id)
  if (!existing) return problem({ status: 404, detail: 'Maintenance note not found' })

  if (data.flightMins !== undefined) {
    const baseline = await getAjlbLiveBaselineFlightMins(
      existing.aircraftRegistration,
      existing.ajlbSeqNo,
    )
    if (data.flightMins < baseline) {
      return problem({
        status: 400,
        detail: "This time can't be earlier than the logbook's last validated flight",
      })
    }
  }

  // The schema's own refine only validates rows/blankRowsBefore against each
  // other *within this PATCH body* -- a partial update (e.g. blankRowsBefore
  // alone) must be checked against the note's already-persisted value for
  // whichever field it didn't touch, or it can pass validation here yet still
  // violate the DB's zero-rows-no-blank check constraint.
  const effectiveRows = data.rows ?? existing.rows
  const effectiveBlankRowsBefore = data.blankRowsBefore ?? existing.blankRowsBefore
  if (effectiveRows === 0 && effectiveBlankRowsBefore > 0) {
    return problem({
      status: 400,
      detail: 'blankRowsBefore must be 0 when rows is 0',
    })
  }

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
