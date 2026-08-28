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
  deleteMaintenanceNote,
} from '../../db/maintenance-note-queries.ts'
import { getAjlbLiveBaselineFlightMins, isAjlbItemFrozen } from '../../db/flight-log-queries.ts'
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

  // Both position guards below test what the request would CHANGE, not what it mentions:
  // the edit dialog resubmits flightMins and rows with every description fix, so guarding
  // on presence alone would make a note that is legitimately parked in the frozen region
  // impossible to correct the wording of.
  const movesNote =
    (data.flightMins !== undefined && data.flightMins !== existing.flightMins) ||
    (data.rows !== undefined && data.rows !== existing.rows)

  // Once the page the note sits on has been validated, its position is written on paper:
  // moving its time or changing how many rows it takes would either move it off that row
  // or run it into whatever was frozen next to it (#1267). Its text stays correctable.
  if (movesNote && (await isAjlbItemFrozen('note', id))) {
    return problem({
      status: 400,
      detail:
        "This note is on a validated logbook page, so its time and row count can't be changed",
    })
  }

  if (data.flightMins !== undefined && data.flightMins !== existing.flightMins) {
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

  const updated = await updateMaintenanceNote(
    id,
    data,
    req.user!.memberId!,
    isAdmin ? undefined : req.user!.memberId!,
  )
  if (!updated) return problem({ status: 404, detail: 'Maintenance note not found' })
  res.status(200).json(updated)
})

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params
  const isAdmin = req.user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN)

  const existing = await getMaintenanceNote(id)
  if (!existing) return problem({ status: 404, detail: 'Maintenance note not found' })

  // Deleting a note whose row is already written would leave a hole in a validated page
  // and pull the live rows below it up into the gap (#1267).
  if (await isAjlbItemFrozen('note', id)) {
    return problem({
      status: 400,
      detail: "This note is on a validated logbook page and can't be deleted",
    })
  }

  const baseline = await getAjlbLiveBaselineFlightMins(
    existing.aircraftRegistration,
    existing.ajlbSeqNo,
  )
  if (existing.flightMins < baseline) {
    return problem({
      status: 400,
      detail: "This time can't be earlier than the logbook's last validated flight",
    })
  }

  const deleted = await deleteMaintenanceNote(id, isAdmin ? undefined : req.user!.memberId!)
  if (!deleted) return problem({ status: 404, detail: 'Maintenance note not found' })
  res.status(204).end()
})

export default router
