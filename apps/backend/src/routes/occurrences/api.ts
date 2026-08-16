import { Router, type Request, type Response } from 'express'
import multer from 'multer'

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
  type OccurrenceAttachment,
  type OccurrenceComment,
  type OccurrenceFilters,
  type OccurrencesListResponse,
} from '@mik/contracts/occurrences'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  addOccurrenceAccess,
  addOccurrenceAttachment,
  copyOccurrenceAttachments,
  countOccurrenceAttachments,
  createOccurrence,
  deleteOccurrenceAccess,
  getOccurrence,
  getOccurrenceAttachment,
  getOccurrences,
  removeOccurrenceAttachment,
  updateOccurrence,
  updateOccurrenceAccess,
} from '../../db/occurrence-queries.ts'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import { compressImageForUpload, IMAGE_UPLOAD_RAW_BYTES } from '../../util/imageUpload.ts'
import dayjs from 'dayjs'

import { sendOccurrenceNotification } from '../../templates/occurrenceNotification.ts'
import { sendCamoNotification } from '../../templates/camoNotification.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { getMemberRolesByPermission } from '../../db/member-queries.ts'
import { storageService } from '../../services/storage.ts'
import { db } from '../../db/connection.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

const OCCURRENCE_ATTACHMENT_BUCKET =
  process.env.OCCURRENCE_ATTACHMENT_BUCKET ??
  (process.env.NODE_ENV === 'production'
    ? 'mik-occurrence-attachments'
    : 'mik-occurrence-attachments-test')

// role_id of the dedicated CAMO role, created in V1690__AddCamoRole.sql
const CAMO_ROLE_ID = 'CAMO'

const MAX_ATTACHMENT_BYTES = 1 * 1024 * 1024 // 1 MB — post-compression image limit
const MAX_ATTACHMENTS_PER_REPORT = 5

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_RAW_BYTES },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG or WEBP images are allowed as attachments'))
    }
  },
})

const sanitizeAttachmentFileName = (fileName: string): string => {
  const sanitized = fileName
    .replace(/\.[^.]+$/, '')
    .replaceAll(/[^a-zA-Z0-9_-]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

  return sanitized || 'attachment'
}

// Always re-encodes through sharp, which drops all metadata (EXIF GPS/device/timestamp)
// unless .withMetadata() is called - this is what guarantees a reporter's picture can
// never de-anonymize them, on the original report or the anonymized copy.
export async function processAttachmentImage(
  file: Express.Multer.File,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const buffer = await compressImageForUpload(file.buffer, {
    maxWidth: 2000,
    maxHeight: 2000,
    targetBytes: MAX_ATTACHMENT_BYTES,
  })

  return {
    buffer,
    fileName: `${sanitizeAttachmentFileName(file.originalname)}.jpg`,
    mimeType: 'image/jpeg',
  }
}

router.use(
  validateUser(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.SMS_MANAGER,
    MIKPermissions.SMS_PROCESSOR,
    MIKPermissions.CAMO_USER,
  ),
)

// attachments may contain identifying pictures (the reporter's own photo instead of
// the intended subject) - only the report's author and SMS roles may see them, not
// members who were separately granted read access via the sharing card
const canSeeAttachments = (occurrence: Occurrence, user: JWTUser) =>
  occurrence.access.some((a) => a.author && a.memberId === user.memberId) ||
  user.permissions.includes(MIKPermissions.SMS_MANAGER) ||
  user.permissions.includes(MIKPermissions.SMS_PROCESSOR)

const parseAttachmentId = (raw: string): number | undefined => {
  const id = Number(raw)
  return Number.isInteger(id) ? id : undefined
}

// never expose original author details of anonymized reports
const anonymize = (occurrence: Occurrence, user: JWTUser) => {
  const anonymize = ![
    OccurrenceStatus.NEW,
    OccurrenceStatus.RECEIVED,
    OccurrenceStatus.DELETED,
  ].includes(occurrence.status)

  return {
    ...occurrence,
    access: occurrence.access.map((a) => ({
      ...a,
      memberId: anonymize && a.author ? '-' : a.memberId,
      lastName: anonymize && a.author ? 'Author' : a.lastName,
    })),
    createdBy: anonymize ? '-' : occurrence.createdBy,
    attachments: canSeeAttachments(occurrence, user) ? occurrence.attachments : [],
  }
}

router.get(
  '/:reportId',
  async (req: Request<Record<string, string>>, res: Response<Occurrence | undefined>) => {
    const { reportId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'read')
    if (!occurrence || occurrence.status === OccurrenceStatus.DELETED) {
      return problem({ status: 404, detail: 'Report not found' })
    }
    res.status(200).json(anonymize(occurrence, req.user!))
  },
)

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
  res.status(200).json({ occurrences: occurrences.map((o) => anonymize(o, req.user!)) })
})

router.post('/', async (req: Request<Record<string, string>>, res: Response<Occurrence>) => {
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
        ...smsProcessorRoles.map((role) => ({
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
  const anonymized = anonymize(created, req.user!)
  await sendOccurrenceNotification(
    sendEmail,
    smsProcessorRoles.map((r) => r.roleId),
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
    res.status(200).json(anonymize(updated, req.user!))
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
    await addOccurrenceAccess(
      occurrence.id,
      req.user!,
      undefined,
      validateAccessPermission(access, req.user!),
    )

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
    MIKPermissions.CAMO_USER,
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
    res.status(200).json(anonymize(updated, req.user!))
  },
)

// SMS processor/manager decides to share an occurrence with CAMO once it has
// been anonymized and involves an aircraft technical fault. Idempotent: the
// unique_report_role constraint plus this pre-check stop the email/access
// from being granted twice.
router.post(
  '/:reportId/camo',
  validateUser(MIKPermissions.SMS_MANAGER, MIKPermissions.SMS_PROCESSOR),
  async (req: Request<{ reportId: string }>, res: Response<Occurrence>) => {
    const { reportId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'manage')
    if (!occurrence) {
      return problem({ status: 404, detail: 'Report not found' })
    }
    if (occurrence.status !== OccurrenceStatus.ANONYMIZED || !occurrence.aircraftTechnicalFault) {
      return problem({
        status: 400,
        detail: 'Report is not eligible to be shared with CAMO',
      })
    }
    const camoRoles = await getMemberRolesByPermission(MIKPermissions.CAMO_USER)
    if (camoRoles.length === 0) {
      return problem({ status: 400, detail: 'No CAMO role is configured' })
    }
    const camoRoleIds = new Set([CAMO_ROLE_ID, ...camoRoles.map((role) => role.roleId)])
    if (occurrence.access.some((access) => access.roleId && camoRoleIds.has(access.roleId))) {
      return problem({ status: 409, detail: 'Report has already been shared with CAMO' })
    }

    let newAccess: OccurrenceAccess[]
    try {
      newAccess = await addOccurrenceAccess(
        occurrence.id,
        req.user!,
        undefined,
        // CAMO can view and comment, but not edit or manage the report
        ...camoRoles.map((role) => ({
          roleId: role.roleId,
          author: false,
          write: true,
          manage: false,
        })),
      )
    } catch (error: any) {
      // pre-check above is not race-safe against concurrent requests; fall back to
      // the unique_report_role constraint to still fail gracefully instead of 500ing
      if (error.code === '23505') {
        return problem({ status: 409, detail: 'Report has already been shared with CAMO' })
      }
      throw error
    }

    const shared = anonymize(
      { ...occurrence, access: [...occurrence.access, ...newAccess] },
      req.user!,
    )

    await sendCamoNotification(sendEmail, [...camoRoleIds], shared)

    res.status(200).json(shared)
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
      // The whole sequence below must succeed or fail together: if any step throws,
      // the original report must not end up marked RECEIVED with access already
      // revoked but no valid anonymized copy.
      const received = await db.transaction().execute(async (trx) => {
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
            access: occurrence.access.map((access) => ({
              ...access,
              // SMS processors have now write access to the anonymizing report,
              // everyone (authors) else can only read
              write: !!access.roleId,
              manage: !!access.roleId,
            })),
          },
          req.user!,
          trx,
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
          trx,
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
            trx,
          )
        }

        // copy (not share) attachments to the anonymizing report so the independent
        // processor can remove a picture there without touching the original record
        const attachments = await copyOccurrenceAttachments(
          occurrence.id,
          anonymizingReport.id,
          OCCURRENCE_ATTACHMENT_BUCKET,
          trx,
        )

        return { ...anonymizingReport, attachments }
      })

      return res.status(200).json(anonymize(received, req.user!))
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
        .filter((access) => access.manage)
        .map((access) => access.accessId!)
      await deleteOccurrenceAccess(occurrence.id, ...deletedAccessIds)
      const newAccesses = await addOccurrenceAccess(
        occurrence.id,
        req.user!,
        undefined,
        // add SMS managers with full access
        ...smsManagerRoles.map((role) => ({
          roleId: role.roleId,
          author: false,
          write: true,
          manage: true,
        })),
      )

      const access = occurrence.access
        .filter((access) => !deletedAccessIds.includes(access.accessId!))
        .concat(newAccesses)

      const anonymized = anonymize({ ...updated, access: access }, req.user!)

      // send email notifications to SMS managers
      await sendOccurrenceNotification(
        sendEmail,
        smsManagerRoles.map((r) => r.roleId),
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
      return res.status(200).json(anonymize(updated, req.user!))
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
      return res.status(200).json(anonymize(updated, req.user!))
    }

    const updated = await updateOccurrence(
      occurrence,
      {
        status,
        comments: [...occurrence.comments, comment],
      },
      req.user!,
    )
    res.status(200).json(anonymize(updated, req.user!))
  },
)

router.post(
  '/:reportId/attachments',
  attachmentUpload.single('file'),
  async (req: Request<{ reportId: string }>, res: Response<OccurrenceAttachment>) => {
    const { reportId } = req.params
    if (!req.file) {
      return problem({ status: 400, detail: 'No attachment uploaded' })
    }

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'write')
    if (!occurrence || !canSeeAttachments(occurrence, req.user!)) {
      return problem({ status: 404, detail: 'Report not found' })
    }
    if (occurrence.status === OccurrenceStatus.DELETED) {
      return problem({ status: 404, detail: 'Report locked' })
    }

    // fast-fail before spending time on image processing/upload; the authoritative
    // check happens atomically alongside the insert in addOccurrenceAttachment
    const attachmentCount = await countOccurrenceAttachments(occurrence.id)
    if (attachmentCount >= MAX_ATTACHMENTS_PER_REPORT) {
      return problem({
        status: 400,
        detail: `A report can have at most ${MAX_ATTACHMENTS_PER_REPORT} attachments.`,
      })
    }

    let uploadKey: string | undefined
    try {
      const { buffer, fileName, mimeType } = await processAttachmentImage(req.file)
      const upload = await storageService.uploadFile(
        buffer,
        `${Date.now()}_${fileName}`,
        mimeType,
        `occurrences/${occurrence.id}`,
        OCCURRENCE_ATTACHMENT_BUCKET,
      )
      uploadKey = upload.key

      const attachment = await addOccurrenceAttachment(
        occurrence.id,
        {
          fileName,
          mimeType,
          fileSize: buffer.length,
          storageKey: upload.key,
          originStatus: occurrence.status,
        },
        req.user!,
        MAX_ATTACHMENTS_PER_REPORT,
      )
      if (!attachment) {
        return problem({
          status: 400,
          detail: `A report can have at most ${MAX_ATTACHMENTS_PER_REPORT} attachments.`,
        })
      }

      res.status(200).json(attachment)
    } catch (error) {
      if (uploadKey) {
        await storageService
          .deleteFile(uploadKey, OCCURRENCE_ATTACHMENT_BUCKET)
          .catch((deleteError) => {
            logger.error('Failed to roll back uploaded occurrence attachment file', deleteError)
          })
      }
      logger.error('Occurrence attachment upload failed', error)
      throw error
    }
  },
)

router.delete(
  '/:reportId/attachments/:attachmentId',
  async (req: Request<{ reportId: string; attachmentId: string }>, res: Response<void>) => {
    const { reportId, attachmentId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'write')
    if (!occurrence || !canSeeAttachments(occurrence, req.user!)) {
      return problem({ status: 404, detail: 'Report not found' })
    }
    if (occurrence.status === OccurrenceStatus.DELETED) {
      return problem({ status: 404, detail: 'Report locked' })
    }

    const parsedAttachmentId = parseAttachmentId(attachmentId)
    if (parsedAttachmentId === undefined) {
      return problem({ status: 404, detail: 'Attachment not found' })
    }

    const attachment = await getOccurrenceAttachment(occurrence.id, parsedAttachmentId)
    if (!attachment) {
      return problem({ status: 404, detail: 'Attachment not found' })
    }

    await removeOccurrenceAttachment(
      occurrence.id,
      parsedAttachmentId,
      OCCURRENCE_ATTACHMENT_BUCKET,
      req.user!,
    )
    await updateOccurrence(
      occurrence,
      {
        comments: [
          ...occurrence.comments,
          {
            at: new Date().toISOString(),
            comment: `Attachment removed: ${attachment.fileName}`,
            by: req.user!.lastName,
            status: null,
          },
        ],
      },
      req.user!,
    )

    res.status(204).send()
  },
)

router.get(
  '/:reportId/attachments/:attachmentId/url',
  async (
    req: Request<{ reportId: string; attachmentId: string }>,
    res: Response<{ url: string }>,
  ) => {
    const { reportId, attachmentId } = req.params

    const occurrence = await getOccurrence(reportId, accessFilters(req.user!), 'read')
    if (!occurrence || !canSeeAttachments(occurrence, req.user!)) {
      return problem({ status: 404, detail: 'Attachment not found' })
    }

    const parsedAttachmentId = parseAttachmentId(attachmentId)
    if (parsedAttachmentId === undefined) {
      return problem({ status: 404, detail: 'Attachment not found' })
    }

    const attachment = await getOccurrenceAttachment(occurrence.id, parsedAttachmentId)
    if (!attachment) {
      return problem({ status: 404, detail: 'Attachment not found' })
    }

    const url = await storageService.getPresignedUrl(
      attachment.storageKey,
      300,
      OCCURRENCE_ATTACHMENT_BUCKET,
    )
    res.status(200).json({ url })
  },
)
