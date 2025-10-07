import { Router, type Request, type Response } from 'express'

import {
  AircraftJourneyLogBookFilterSchema,
  AircraftJourneyLogBookSchema,
  type AircraftJourneyLogBook,
  type AjlbListResponse,
} from './model.ts'
import { getAjlbs, getAjlb, createAjlb, updateAjlb, deleteAjlb } from '../../db/ajlb-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { UpsertSchema } from '../../types/schema.ts'
import { problem } from '../response.ts'
import { getFlightLogs, updateFlightLog } from '../../db/flight-log-queries.ts'
import { FlightLogStatus } from '../flight-log/models.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/:registration/:seqNo', async (req: Request, res: Response<AircraftJourneyLogBook>) => {
  const { registration, seqNo } = req.params

  const book = await getAjlb(registration, Number(seqNo))
  res.status(200).json(book)
})

router.get('/', async (req: Request, res: Response<AjlbListResponse>) => {
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
