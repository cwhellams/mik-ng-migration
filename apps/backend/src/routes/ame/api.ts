import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'

import {
  AmeListFiltersSchema,
  AmeReviewFiltersSchema,
  CreateAmeEntrySchema,
  RateAmeEntrySchema,
  RejectAmeEntrySchema,
  RequestAmeRemovalSchema,
  SuggestAmeEditSchema,
} from '@mik/contracts/ame'
import {
  approveAmeEditSuggestion,
  approveAmeEntry,
  approveAmeRemovalRequest,
  createAmeEditSuggestion,
  createAmeEntry,
  createAmeRemovalRequest,
  getAllAmeEntries,
  getAllEditSuggestions,
  getAllRemovalRequests,
  getApprovedAmeEntries,
  getPendingReviewCounts,
  rejectAmeEditSuggestion,
  rejectAmeEntry,
  rejectAmeRemovalRequest,
  upsertAmeRating,
} from '../../db/ame-queries.ts'
import { getMemberById } from '../../db/member-queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { sendAmeSecretaryNotification } from '../../templates/ameSubmissionNotification.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'

export const router = Router()

router.get(
  '/',
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = AmeListFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid query parameters' })
    }
    const result = await getApprovedAmeEntries(parsed.data, req.user!.memberId)
    return res.json(result)
  },
)

router.post(
  '/',
  validateUser(MIKPermissions.AME_USER, MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = CreateAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const entry = await createAmeEntry(parsed.data, req.user!)

    const submitter = await getMemberById(req.user!.memberId)
    void sendAmeSecretaryNotification(
      sendEmail,
      'new',
      entry.name,
      submitter ? `${submitter.firstName} ${submitter.lastName}` : entry.submittedBy,
    ).catch((error) => {
      logger.error('Failed to send AME new-submission notification', error)
    })

    return res.status(HttpStatusCode.Created).json(entry)
  },
)

router.post(
  '/:id/rating',
  validateUser(MIKPermissions.AME_USER, MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = RateAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    await upsertAmeRating(String(req.params.id), req.user!.memberId, parsed.data.stars)
    return res.status(HttpStatusCode.NoContent).send()
  },
)

router.post(
  '/:id/edit-suggestion',
  validateUser(MIKPermissions.AME_USER, MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = SuggestAmeEditSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const suggestion = await createAmeEditSuggestion(String(req.params.id), parsed.data, req.user!)

    const submitter = await getMemberById(req.user!.memberId)
    void sendAmeSecretaryNotification(
      sendEmail,
      'edit',
      suggestion.currentName ?? suggestion.name,
      submitter ? `${submitter.firstName} ${submitter.lastName}` : suggestion.submittedBy,
    ).catch((error) => {
      logger.error('Failed to send AME edit-suggestion notification', error)
    })

    return res.status(HttpStatusCode.Created).json(suggestion)
  },
)

router.post(
  '/:id/removal-request',
  validateUser(MIKPermissions.AME_USER, MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = RequestAmeRemovalSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const request = await createAmeRemovalRequest(String(req.params.id), parsed.data, req.user!)

    const submitter = await getMemberById(req.user!.memberId)
    void sendAmeSecretaryNotification(
      sendEmail,
      'removal',
      request.ameName ?? request.ameId,
      submitter ? `${submitter.firstName} ${submitter.lastName}` : request.submittedBy,
      request.reason,
    ).catch((error) => {
      logger.error('Failed to send AME removal-request notification', error)
    })

    return res.status(HttpStatusCode.Created).json(request)
  },
)

router.get(
  '/admin/pending/count',
  validateUser(MIKPermissions.AME_ADMIN),
  async (_req: Request, res: Response) => {
    const counts = await getPendingReviewCounts()
    return res.json(counts)
  },
)

router.get(
  '/admin/all',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = AmeListFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid query parameters' })
    }
    const result = await getAllAmeEntries(parsed.data, req.user!.memberId)
    return res.json(result)
  },
)

router.get(
  '/admin/edit-suggestions',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = AmeReviewFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid query parameters' })
    }
    const result = await getAllEditSuggestions(parsed.data)
    return res.json(result)
  },
)

router.get(
  '/admin/removal-requests',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = AmeReviewFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid query parameters' })
    }
    const result = await getAllRemovalRequests(parsed.data)
    return res.json(result)
  },
)

router.post(
  '/:id/approve',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const entry = await approveAmeEntry(String(req.params.id), req.user!)
    if (!entry) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Entry not found or already processed',
      })
    }
    return res.json(entry)
  },
)

router.post(
  '/:id/reject',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = RejectAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const entry = await rejectAmeEntry(String(req.params.id), req.user!, parsed.data.reason)
    if (!entry) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Entry not found or already processed',
      })
    }
    return res.json(entry)
  },
)

router.post(
  '/edit-suggestions/:id/approve',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const suggestion = await approveAmeEditSuggestion(String(req.params.id), req.user!)
    if (!suggestion) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Suggestion not found or already processed',
      })
    }
    return res.json(suggestion)
  },
)

router.post(
  '/edit-suggestions/:id/reject',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = RejectAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const suggestion = await rejectAmeEditSuggestion(
      String(req.params.id),
      req.user!,
      parsed.data.reason,
    )
    if (!suggestion) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Suggestion not found or already processed',
      })
    }
    return res.json(suggestion)
  },
)

router.post(
  '/removal-requests/:id/approve',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const request = await approveAmeRemovalRequest(String(req.params.id), req.user!)
    if (!request) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Request not found or already processed',
      })
    }
    return res.json(request)
  },
)

router.post(
  '/removal-requests/:id/reject',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = RejectAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const request = await rejectAmeRemovalRequest(
      String(req.params.id),
      req.user!,
      parsed.data.reason,
    )
    if (!request) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Request not found or already processed',
      })
    }
    return res.json(request)
  },
)
