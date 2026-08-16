import { Router, type Request, type Response } from 'express'
import {
  AircraftHilFilterSchema,
  AircraftHilOverviewFilterSchema,
  CreateAircraftHilSchema,
  UpdateAircraftHilSchema,
  CreateAircraftHilExtensionSchema,
  type AircraftHil,
  type AircraftHilAuditEntry,
  type AircraftHilExtension,
  type AircraftHilOverview,
} from '@mik/contracts/aircraft-hil'
import {
  getAircraftHilEntries,
  createAircraftHilEntry,
  updateAircraftHilEntry,
  getAircraftHilExtensions,
  createAircraftHilExtension,
  getAircraftHilEntry,
  getAircraftHilOverview,
  getAircraftHilAudit,
} from '../../db/aircraft-hil-queries.ts'
import { resolveDefectsByHil, getDefect, setDefectsForHil } from '../../db/defect-queries.ts'
import { getMaintenanceNote } from '../../db/maintenance-note-queries.ts'
import { db } from '../../db/connection.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'

export const router = Router()

// Hold item restrictions affect what kind of flights can be flown, so the
// read-only overview is available to everyone who can see aircraft details.
// Declared before the flight-log guard below so that guard does not apply.
router.get(
  '/overview',
  validateUser(
    MIKPermissions.AIRCRAFT_USER,
    MIKPermissions.AIRCRAFT_ADMIN,
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
  ),
  async (req: Request, res: Response<AircraftHilOverview[]>) => {
    const filters = AircraftHilOverviewFilterSchema.parse(req.query)
    const overview = await getAircraftHilOverview(
      filters.aircraftRegistration,
      filters.includeResolved,
    )
    res.status(200).json(overview)
  },
)

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/', async (req: Request, res: Response<AircraftHil[]>) => {
  const filters = AircraftHilFilterSchema.parse(req.query)
  const entries = await getAircraftHilEntries(filters.aircraftRegistration)
  res.status(200).json(entries)
})

router.post(
  '/',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request, res: Response<AircraftHil>) => {
    const data = CreateAircraftHilSchema.parse(req.body)

    const defect = await getDefect(data.defectId)
    if (!defect || defect.aircraftRegistration !== data.aircraftRegistration) {
      return problem({ status: 400, detail: 'Defect not found for this aircraft' })
    }
    if (defect.status !== 'ACTIVE') {
      return problem({
        status: 400,
        detail: 'Defect is already deferred to a hold item or resolved',
      })
    }

    const entry = await createAircraftHilEntry(data, req.user!.memberId!)
    res.status(201).json(entry)
  },
)

router.patch(
  '/:id',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ id: string }>, res: Response<AircraftHil>) => {
    const { id } = req.params
    const data = UpdateAircraftHilSchema.parse(req.body)

    const existing = await getAircraftHilEntry(id)
    if (!existing) return problem({ status: 404, detail: 'HIL entry not found' })

    if (data.resolvedNoteId) {
      const note = await getMaintenanceNote(data.resolvedNoteId)
      if (!note || note.aircraftRegistration !== existing.aircraftRegistration) {
        return problem({
          status: 400,
          detail: 'Maintenance note belongs to a different aircraft',
        })
      }
    }

    // An extension is the effective due date of the item it extends, so leaving
    // one behind on an item with no due date would be contradictory.
    if (data.dueDate === null && (await getAircraftHilExtensions(id)).length > 0) {
      return problem({
        status: 400,
        detail: 'Remove the extension before clearing the due date',
      })
    }

    if (data.defectIds) {
      if (existing.resolvedNoteId) {
        return problem({
          status: 400,
          detail: 'The deferred defects of a closed hold item cannot be changed',
        })
      }
      for (const defectId of data.defectIds) {
        const defect = await getDefect(defectId)
        if (!defect || defect.aircraftRegistration !== existing.aircraftRegistration) {
          return problem({ status: 400, detail: 'Defect not found for this aircraft' })
        }
        if (defect.status === 'RESOLVED') {
          return problem({ status: 400, detail: 'Defect is already resolved' })
        }
        if (defect.hilId && defect.hilId !== id) {
          return problem({
            status: 400,
            detail: 'Defect is already deferred to another hold item',
          })
        }
      }
    }

    const updated = await db.transaction().execute(async (trx) => {
      const result = await updateAircraftHilEntry(id, data, req.user!.memberId!, trx)
      if (!result) return undefined

      // Relink before resolving, so a defect swapped in by the same request is
      // released by the maintenance note along with the rest.
      if (data.defectIds) {
        const relinked = await setDefectsForHil(
          id,
          existing.aircraftRegistration,
          data.defectIds,
          req.user!.memberId!,
          trx,
        )
        if (!relinked) {
          return problem({
            status: 400,
            detail: 'Defect not found for this aircraft, or no longer active',
          })
        }
      }

      if (data.resolvedNoteId) {
        await resolveDefectsByHil(
          id,
          existing.aircraftRegistration,
          data.resolvedNoteId,
          req.user!.memberId!,
          trx,
        )
      }

      return result
    })
    if (!updated) return problem({ status: 404, detail: 'HIL entry not found' })

    res.status(200).json(updated)
  },
)

router.get(
  '/:id/audit',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ id: string }>, res: Response<AircraftHilAuditEntry[]>) => {
    const { id } = req.params
    const hil = await getAircraftHilEntry(id)
    if (!hil) return problem({ status: 404, detail: 'HIL entry not found' })
    const audit = await getAircraftHilAudit(id)
    res.status(200).json(audit)
  },
)

router.get(
  '/:id/extensions',
  async (req: Request<{ id: string }>, res: Response<AircraftHilExtension[]>) => {
    const { id } = req.params
    const hil = await getAircraftHilEntry(id)
    if (!hil) return problem({ status: 404, detail: 'HIL entry not found' })
    const extensions = await getAircraftHilExtensions(id)
    res.status(200).json(extensions)
  },
)

router.post(
  '/:id/extensions',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ id: string }>, res: Response<AircraftHilExtension>) => {
    const { id } = req.params
    const hil = await getAircraftHilEntry(id)
    if (!hil) return problem({ status: 404, detail: 'HIL entry not found' })
    // With no due date there is nothing to extend (issue #1120)
    if (!hil.dueDate) {
      return problem({ status: 400, detail: 'A hold item with no due date cannot be extended' })
    }
    const existingExtensions = await getAircraftHilExtensions(id)
    if (existingExtensions.length > 0) {
      return problem({ status: 400, detail: 'A hold item can only be extended once' })
    }
    const data = CreateAircraftHilExtensionSchema.parse(req.body)
    const extension = await createAircraftHilExtension(id, data, req.user!.memberId!)
    res.status(201).json(extension)
  },
)

export default router
