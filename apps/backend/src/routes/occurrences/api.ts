import { Router, type Request, type Response } from 'express'

import {
  OccurrenceAccessSchema,
  OccurrenceClosedPayloadSchema,
  OccurrenceCommentSchema,
  OccurrenceFiltersSchema,
  OccurrenceProcessedPayloadSchema,
  OccurrenceStatus,
  OccurrenceUpsertSchema,
  type Occurrence,
  type OccurrenceAccess,
  type OccurrenceComment,
  type OccurrenceFilters,
  type OccurrencesListResponse,
} from './models.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  addOccurrenceAccess,
  createOccurrence,
  deleteOccurrenceAccess,
  getOccurrence,
  getOccurrences,
  updateOccurrence,
  updateOccurrenceAccess,
} from '../../db/occurrence-queries.ts'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import dayjs from 'dayjs'

import { sendOccurrenceNotification } from '../../templates/occurrenceNotification.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { getMemberRolesByPermission } from '../../db/member-queries.ts'

export const router = Router()

router.use(
  validateUser(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.SMS_MANAGER,
    MIKPermissions.SMS_PROCESSOR,
  ),
)

// never expose original author details of anonymized reports
const anonymize = (occurrence: Occurrence) => {
  const anonymize = ![
    OccurrenceStatus.NEW,
    OccurrenceStatus.RECEIVED,
    OccurrenceStatus.DELETED,
  ].includes(occurrence.status)

  return {
    ...occurrence,
    access: occurrence.access.map(a => ({
      ...a,
      memberId: anonymize && a.author ? '-' : a.memberId,
      lastName: anonymize && a.author ? 'Author' : a.lastName,
    })),
    createdBy: anonymize ? '-' : occurrence.createdBy,
  }
}

router.get('/:reportId', async (req: Request, res: Response<Occurrence | undefined>) => {
  const { reportId } = req.params

  const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'read')
  if (!occurrence || occurrence.status === OccurrenceStatus.DELETED) {
    return problem({ status: 404, detail: 'Report not found' })
  }
  res.status(200).json(anonymize(occurrence))
})

const accessFilters = (user: JWTUser) => {
  const isAdmin =
    user.permissions.includes(MIKPermissions.SMS_MANAGER) ||
    user.permissions.includes(MIKPermissions.SMS_PROCESSOR)

  return {
    memberId: isAdmin ? undefined : user.memberId,
    roles: user.roles,
  }
}

router.get('/', async (req: Request<OccurrenceFilters>, res: Response<OccurrencesListResponse>) => {
  const query = OccurrenceFiltersSchema.parse(req.query)
  const occurrences = await getOccurrences(
    {
      ...query,
      ignoreStatuses: [
        // do not list the original report once there is an anonymized version
        OccurrenceStatus.RECEIVED,
        OccurrenceStatus.DELETED,
      ],
    },
    accessFilters(req.user!),
  )
  res.status(200).json({ occurrences: occurrences.map(anonymize) })
})

router.post('/', async (req: Request, res: Response<Occurrence>) => {
  const now = dayjs().set('millisecond', 0)
  const occurrence = OccurrenceUpsertSchema.strip().parse(req.body)

  const smsProcessorRoles = await getMemberRolesByPermission(MIKPermissions.SMS_PROCESSOR)

  const created = await createOccurrence(
    {
      ...occurrence,
      status: OccurrenceStatus.NEW,
      reportDate: now.toISOString(),
      deadLine:
        occurrence.isDtoReport || occurrence.aircraftTechnicalFault
          ? now.add(72, 'hour').toISOString()
          : undefined,
      linkedReportId: null,
      access: [
        // the reporter can always share the report as they wish to other members
        {
          memberId: req.user!.memberId,
          author: true,
          write: true,
          manage: true,
        },
        // SMS processors can mark the report received but not modify it
        ...smsProcessorRoles.map(role => ({
          author: false,
          roleId: role.roleId,
          write: false,
          manage: true,
        })),
      ],
      comments: [
        {
          at: now.toISOString(),
          by: 'Author',
          status: OccurrenceStatus.NEW,
        },
      ],
    },
    req.user!,
  )

  // send email notifications to every member having roles with SMS independent processor permission
  const anonymized = anonymize(created)
  await sendOccurrenceNotification(
    sendEmail,
    smsProcessorRoles.map(r => r.roleId),
    anonymized,
  )

  res.status(200).json(anonymized)
})

router.patch(
  '/:reportId',
  async (req: Request<{ reportId: string }>, res: Response<Occurrence>) => {
    const { reportId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'write')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }
    if (
      occurrence.status !== OccurrenceStatus.NEW &&
      occurrence.status !== OccurrenceStatus.ANONYMIZING
    ) {
      return problem({ status: 404, detail: 'Report locked' })
    }

    const patch = OccurrenceUpsertSchema.strip().partial().parse(req.body)

    const updated = await updateOccurrence(
      occurrence,
      {
        ...patch,
        deadLine:
          patch.isDtoReport || patch.aircraftTechnicalFault
            ? dayjs(occurrence.reportDate).add(72, 'hour').toISOString()
            : undefined,
      },
      req.user!,
    )
    res.status(200).json(anonymize(updated))
  },
)

const validateAccessPermission = (access: OccurrenceAccess, user: JWTUser) => {
  const isSmsManager = user.permissions.includes(MIKPermissions.SMS_MANAGER)
  if (!isSmsManager && access.roleId) {
    return problem({ status: 400, detail: 'Role permissions can only be assigned by SMS managers' })
  }

  return {
    ...access,
    // only SMS managers can give write access
    write: isSmsManager ? access.write : false,
    // nobody else can give manage access
    manage: false,
  }
}

router.post(
  '/:reportId/access',
  validateUser(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.SMS_MANAGER,
  ),
  async (req: Request<{ reportId: string }>, res: Response<OccurrenceAccess>) => {
    const { reportId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'manage')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }

    const access = OccurrenceAccessSchema.parse(req.body)
    await addOccurrenceAccess(occurrence.id, req.user!, validateAccessPermission(access, req.user!))

    res.status(200).json(access)
  },
)

router.put(
  '/:reportId/access/:accessId',
  validateUser(MIKPermissions.SMS_MANAGER),
  async (req: Request<{ reportId: string }>, res: Response<OccurrenceAccess>) => {
    const { reportId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'manage')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }

    const patch = OccurrenceAccessSchema.parse(req.body)
    const validated = validateAccessPermission(patch, req.user!)
    await updateOccurrenceAccess(occurrence.id, validated, req.user!)
    res.status(200).json(validated)
  },
)

router.delete(
  '/:reportId/access/:accessId',
  validateUser(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.SMS_MANAGER,
  ),
  async (req: Request<{ reportId: string; accessId: string }>, res: Response<void>) => {
    const { reportId, accessId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'manage')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }
    await deleteOccurrenceAccess(occurrence.id, Number(accessId))
    res.status(204).send()
  },
)

router.post(
  '/:reportId/comment',
  validateUser(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.SMS_MANAGER,
  ),
  async (req: Request<{ reportId: string }>, res: Response<Occurrence>) => {
    const { reportId } = req.params
    const comment = OccurrenceCommentSchema.partial().parse(req.body)
    if (!comment.comment) {
      return problem({ status: 400, detail: 'Comment is empty' })
    }

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'write')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }

    const updated = await updateOccurrence(
      occurrence,
      {
        comments: [
          ...occurrence.comments,
          {
            at: new Date().toISOString(),
            comment: comment.comment,
            by: req.user!.lastName,
            status: null,
          },
        ],
      },
      req.user!,
    )
    res.status(200).json(anonymize(updated))
  },
)

const validStatusTransitions: { [key in OccurrenceStatus]?: OccurrenceStatus[] } = {
  NEW: [OccurrenceStatus.RECEIVED, OccurrenceStatus.DELETED],
  ANONYMIZING: [OccurrenceStatus.ANONYMIZED],
  ANONYMIZED: [OccurrenceStatus.PROCESSED],
  PROCESSED: [OccurrenceStatus.CLOSED],
}

router.post(
  '/:reportId/status/:status',
  validateUser(MIKPermissions.SMS_MANAGER, MIKPermissions.SMS_PROCESSOR),
  async (
    req: Request<{ reportId: string; status: OccurrenceStatus }>,
    res: Response<Occurrence>,
  ) => {
    const { reportId, status } = req.params
    const comment: OccurrenceComment = {
      at: new Date().toISOString(),
      by: req.user!.lastName,
      status,
    }

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'manage')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }

    if (!validStatusTransitions[occurrence.status]?.includes(status)) {
      return problem({
        status: 400,
        detail: `Invalid status transition, from ${occurrence.status} to ${status}`,
      })
    }

    if (status == OccurrenceStatus.RECEIVED) {
      // Create anonymized version from the original
      const anonymizingReport = await createOccurrence(
        {
          ...occurrence,
          status: OccurrenceStatus.ANONYMIZING,
          linkedReportId: occurrence.id,
          deadLine: occurrence.deadLine,
          comments: [
            ...occurrence.comments,
            {
              ...comment,
              status: OccurrenceStatus.ANONYMIZING,
            },
          ],
          access: occurrence.access.map(access => ({
            ...access,
            // SMS processors have now write access to the anonymizing report,
            // everyone (authors) else can only read
            write: !!access.roleId,
            manage: !!access.roleId,
          })),
        },
        req.user!,
      )

      // mark the original report as received and readonly
      await updateOccurrence(
        occurrence,
        {
          status,
          linkedReportId: anonymizingReport.id,
          comments: [...occurrence.comments, comment],
        },
        req.user!,
      )
      for (const access of occurrence.access) {
        await updateOccurrenceAccess(
          occurrence.id,
          {
            ...access,
            write: false,
            manage: false,
          },
          req.user!,
        )
      }

      return res.status(200).json(anonymize(anonymizingReport))
    } else if (status == OccurrenceStatus.ANONYMIZED) {
      const smsManagerRoles = await getMemberRolesByPermission(MIKPermissions.SMS_MANAGER)
      const updated = await updateOccurrence(
        occurrence,
        {
          status,
          comments: [...occurrence.comments, comment],
        },
        req.user!,
      )

      // Change manage roles from SMS processors to SMS managers
      const deletedAccessIds = occurrence.access
        .filter(access => access.manage)
        .map(access => access.accessId!)
      await deleteOccurrenceAccess(occurrence.id, ...deletedAccessIds)
      const newAccesses = await addOccurrenceAccess(
        occurrence.id,
        req.user!,
        // add SMS managers with full access
        ...smsManagerRoles.map(role => ({
          roleId: role.roleId,
          author: false,
          write: true,
          manage: true,
        })),
      )

      const access = occurrence.access
        .filter(access => !deletedAccessIds.includes(access.accessId!))
        .concat(newAccesses)

      const anonymized = anonymize({ ...updated, access: access })

      // send email notifications to SMS managers
      await sendOccurrenceNotification(
        sendEmail,
        smsManagerRoles.map(r => r.roleId),
        anonymized,
      )

      return res.status(200).json(anonymized)
    } else if (status == OccurrenceStatus.PROCESSED) {
      const processed = OccurrenceProcessedPayloadSchema.parse(req.body)
      const updated = await updateOccurrence(
        occurrence,
        {
          status,
          comments: [...occurrence.comments, comment],
          handling: {
            ...occurrence.handling,
            processed: {
              ...processed,
              by: comment.by,
              at: comment.at,
            },
          },
        },
        req.user!,
      )
      return res.status(200).json(anonymize(updated))
    } else if (status == OccurrenceStatus.CLOSED) {
      const closed = OccurrenceClosedPayloadSchema.parse(req.body)
      const updated = await updateOccurrence(
        occurrence,
        {
          status,
          comments: [...occurrence.comments, comment],
          handling: {
            ...occurrence.handling,
            closed: {
              ...closed,
              by: comment.by,
              at: comment.at,
            },
          },
        },
        req.user!,
      )
      return res.status(200).json(anonymize(updated))
    }

    const updated = await updateOccurrence(
      occurrence,
      {
        status,
        comments: [...occurrence.comments, comment],
      },
      req.user!,
    )
    res.status(200).json(anonymize(updated))
  },
)
