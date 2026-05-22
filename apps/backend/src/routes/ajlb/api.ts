import { Router, type Request, type Response } from 'express'

import {
  AircraftJourneyLogBookFilterSchema,
  AircraftJourneyLogBookSchema,
  type AircraftJourneyLogBook,
  type AjlbFilter,
  type AjlbListResponse,
  type AircraftLandingsBaselineResponse,
} from './model.ts'
import {
  getAjlbs,
  getAjlb,
  createAjlb,
  updateAjlb,
  deleteAjlb,
  getAircraftLandingsBaseline,
  setAircraftLandingsBaseline,
  deleteAircraftLandingsBaseline,
} from '../../db/ajlb-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { UpsertSchema } from '../../types/schema.ts'
import { problem } from '../response.ts'
import { getFlightLogs, updateFlightLog } from '../../db/flight-log-queries.ts'
import { FlightLogStatus } from '../flight-log/models.ts'
import { z } from 'zod'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

// Landing baseline endpoints (must come before generic :registration routes)
router.get(
  '/:registration/baseline',
  async (
    req: Request<{ registration: string }>,
    res: Response<AircraftLandingsBaselineResponse>,
  ) => {
    const { registration } = req.params

    const baseline = await getAircraftLandingsBaseline(registration)
    res.status(200).json({ baseline })
  },
)

router.post(
  '/:registration/baseline',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (
    req: Request<{ registration: string }>,
    res: Response<AircraftLandingsBaselineResponse>,
  ) => {
    const { registration } = req.params
    const schema = z.object({ baselineLandings: z.number().int().min(0) })

    try {
      const { baselineLandings } = schema.parse(req.body)
      await setAircraftLandingsBaseline(registration, baselineLandings, req.user!)

      const baseline = await getAircraftLandingsBaseline(registration)
      res.status(200).json({ baseline })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return problem({ status: 400, detail: 'Invalid baseline landings value' })
      }
      throw error
    }
  },
)

router.delete(
  '/:registration/baseline',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ registration: string }>, res: Response) => {
    const { registration } = req.params

    const removed = await deleteAircraftLandingsBaseline(registration)
    if (!removed) {
      return problem({ status: 404, detail: 'Baseline not found' })
    }

    res.status(204).end()
  },
)

// AJLB logbook endpoints
router.get('/:registration/:seqNo', async (req: Request, res: Response<AircraftJourneyLogBook>) => {
  const { registration, seqNo } = req.params

  const book = await getAjlb(registration, Number(seqNo))
  res.status(200).json(book)
})

router.get('/', async (req: Request<AjlbFilter>, res: Response<AjlbListResponse>) => {
  const filters = AircraftJourneyLogBookFilterSchema.parse(req.query)

  const books = await getAjlbs(filters)
  res.status(200).json({ books })
})

router.post(
  '/',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request, res: Response<AircraftJourneyLogBook>) => {
    const ajlb = UpsertSchema(AircraftJourneyLogBookSchema).parse(req.body)
    await createAjlb(ajlb, req.user!)

    // update all new flights to the new logbook
    const flightLogs = await getFlightLogs({
      aircraftRegistration: ajlb.aircraftRegistration,
      status: FlightLogStatus.NEW,
    })
    for (const log of flightLogs.logs) {
      await updateFlightLog(
        log.flightId,
        {
          ajlbSeqNo: ajlb.seqNo,
        },
        req.user!,
      )
    }

    const book = await getAjlb(ajlb.aircraftRegistration, ajlb.seqNo)
    res.status(200).json(book)
  },
)

router.patch(
  '/:registration/:seqNo',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (
    req: Request<{ registration: string; seqNo: string }>,
    res: Response<AircraftJourneyLogBook>,
  ) => {
    const { registration, seqNo } = req.params

    const patch = AircraftJourneyLogBookSchema.partial().parse(req.body)
    const updated = await updateAjlb(registration, Number(seqNo), patch, req.user!)
    if (!updated) {
      return problem({ status: 404, detail: 'Logbook not found' })
    }

    res.status(200).json(updated)
  },
)

router.delete(
  '/:registration/:seqNo',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request<{ registration: string; seqNo: string }>, res: Response) => {
    const { registration, seqNo } = req.params
    const removed = await deleteAjlb(registration, Number(seqNo))
    if (!removed) {
      return problem({ status: 404, detail: 'Logbook not found' })
    }

    res.status(204).end()
  },
)

export default router
