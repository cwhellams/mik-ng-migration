import { Router, type Request, type Response } from 'express'

import {
  OccurrenceStatus,
  OccurrenceUpsertSchema,
  type Occurrence,
  type OccurrencesListResponse,
} from './models.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  createOccurrence,
  getOccurrence,
  getOccurrences,
  updateOccurrence,
} from '../../db/occurrence-queries.ts'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import dayjs from 'dayjs'

export const router = Router()

router.use(
  validateUser(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.SMS_ADMIN,
    MIKPermissions.SMS_TEAM,
  ),
)

const getLimitations = (
  user: JWTUser,
): {
  owner?: string
  statuses?: OccurrenceStatus[]
} => {
  const isSMSResponsible = user.permissions.includes(MIKPermissions.SMS_ADMIN)
  const isSMSMember = user.permissions.includes(MIKPermissions.SMS_TEAM)
  const isReporter = !isSMSResponsible && !isSMSMember

  if (isReporter) {
    // Reporters can see only their own reports
    return {
      owner: user.memberId!,
    }
  }

  if (isSMSMember) {
    // SMS Members cannot see original reports (NEW, RECEIVED)
    return {
      statuses: [OccurrenceStatus.ANONYMIZED, OccurrenceStatus.CLOSED],
    }
  }

  // SMS Responsible has no limitations
  return {}
}

router.get('/:reportId', async (req: Request, res: Response<Occurrence | undefined>) => {
  const { reportId } = req.params

  const occurrence = await getOccurrence(reportId, getLimitations(req.user!))
  if (!occurrence) {
    return problem({ status: 404, detail: 'Report not found' })
  }
  res.status(200).json(occurrence)
})

router.get('/', async (req: Request, res: Response<OccurrencesListResponse>) => {
  //const filters = OccurrenceFiltersSchema.parse(req.query)

  const occurrences = await getOccurrences(getLimitations(req.user!))
  res.status(200).json({ occurrences })
})

router.post('/', async (req: Request, res: Response<Occurrence>) => {
  const now = dayjs().set('millisecond', 0)
  const occurrence = OccurrenceUpsertSchema.strip().parse(req.body)
  const created = await createOccurrence(
    {
      ...occurrence,
      status: OccurrenceStatus.NEW,
      reportDate: now.toISOString(),
      deadLine: occurrence.isDtoReport ? now.add(72, 'hour').toISOString() : undefined,
      linkedReportId: null,
    },
    req.user!,
  )

  res.status(200).json(created)
})

router.patch(
  '/:reportId',
  async (req: Request<{ reportId: string }>, res: Response<Occurrence>) => {
    const { reportId } = req.params

    const limitations = getLimitations(req.user!)
    const occurrence = await getOccurrence(reportId, limitations)
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }

    const patch = OccurrenceUpsertSchema.strip().partial().parse(req.body)

    const updated = await updateOccurrence(
      occurrence,
      {
        ...patch,
        deadLine: patch.isDtoReport
          ? dayjs(occurrence.reportDate).add(72, 'hour').toISOString()
          : undefined,
      },
      req.user!,
    )
    res.status(200).json(updated)
  },
)

const validStatusTransitions: { [key in OccurrenceStatus]?: OccurrenceStatus[] } = {
  NEW: [OccurrenceStatus.RECEIVED, OccurrenceStatus.DELETED],
  ANONYMIZING: [OccurrenceStatus.ANONYMIZED],
  ANONYMIZED: [OccurrenceStatus.CLOSED],
}

router.post(
  '/:reportId/:status',
  validateUser(MIKPermissions.SMS_ADMIN, MIKPermissions.SMS_TEAM),
  async (
    req: Request<{ reportId: string; status: OccurrenceStatus }>,
    res: Response<Occurrence>,
  ) => {
    const { reportId, status } = req.params

    const limitations = getLimitations(req.user!)
    const occurrence = await getOccurrence(reportId, limitations)
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }

    if (!validStatusTransitions[occurrence.status]?.includes(status)) {
      return problem({
        status: 400,
        detail: `Invalid status transition, from ${occurrence.status} to ${status}`,
      })
    }

    if (status == OccurrenceStatus.RECEIVED && !occurrence.linkedReportId) {
      // Create anonymized version from the original.
      const anonymizingReport = await createOccurrence(
        {
          ...occurrence,
          status: OccurrenceStatus.ANONYMIZING,
          linkedReportId: occurrence.id,
          deadLine: occurrence.deadLine,
        },
        req.user!,
      )
      await updateOccurrence(
        occurrence,
        {
          status,
          linkedReportId: anonymizingReport.id,
        },
        req.user!,
      )
      res.status(200).json(anonymizingReport)
    }

    const updated = await updateOccurrence(
      occurrence,
      {
        status,
      },
      req.user!,
    )
    res.status(200).json(updated)
  },
)
