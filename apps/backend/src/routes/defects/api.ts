import { Router, type Request, type Response } from 'express'
import {
  DefectFilterSchema,
  CreateDefectSchema,
  UpdateDefectSchema,
  type Defect,
} from '@mik/contracts/defects'
import { getDefects, createDefect, updateDefect, getDefect } from '../../db/defect-queries.ts'
import { getAircraftHilEntry } from '../../db/aircraft-hil-queries.ts'
import { getMaintenanceNote } from '../../db/maintenance-note-queries.ts'
import { getAjlbLiveBaselineFlightMins } from '../../db/flight-log-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
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
  const isInFlight = data.flightId != null
  // In-flight defects are tied to one specific, already-recorded flight, so that flight
  // must still be unvalidated (strictly after the frozen baseline) -- you can't retroactively
  // add a defect to a flight that's already been validated. Pre-flight defects aren't tied to
  // any flight and describe "right now", so their time may legitimately equal the baseline
  // exactly (e.g. found on the ramp before any new flight has flown since the last one).
  const rejected = isInFlight ? data.flightMins <= baseline : data.flightMins < baseline
  if (rejected) {
    return problem({
      status: 400,
      detail: isInFlight
        ? 'This flight has already been validated, so a defect can no longer be added to it'
        : "This time can't be earlier than the logbook's last validated flight",
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

  // An in-flight defect (flightId set) is always an inline chip anchored to that flight
  // by id, not by position -- rows is fixed at 0 for it, like flightId/flightMins.
  // Only a pre-flight defect's row count can be corrected after creation.
  if (data.rows !== undefined && defect.flightId != null) {
    return problem({
      status: 400,
      detail: 'rows cannot be changed for an in-flight defect',
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
