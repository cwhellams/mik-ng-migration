import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'

import { validateUser } from '../../middleware/authMiddleware.ts'
import {
  abandonVote,
  addVoteCounter,
  closeVote,
  createMeeting,
  createVote,
  deleteMeeting,
  endMeeting,
  getActiveMeeting,
  getMeetingAttendees,
  getMeetingById,
  getMeetings,
  getMeetingVoteById,
  getMeetingVotes,
  getVoteCounters,
  isAttendee,
  isVoteCounter,
  openVote,
  pendingNotesMeeting,
  registerAttendance,
  removeVoteCounter,
  startMeeting,
  submitVote,
  updateMeeting,
} from '../../db/meeting-queries.ts'
import { addDocument } from '../../db/document-queries.ts'
import { storageService } from '../../services/storage.ts'
import { documentUpload } from '../../util/documentHelper.ts'
import { UpsertSchema } from '../../types/schema.ts'
import logger from '../../lib/logger.ts'
import { MIKPermissions } from '../members/models.ts'
import { DocumentCategory, DocumentSchema } from '../documents/models.ts'
import {
  AddVoteCounterSchema,
  CreateMeetingSchema,
  CreateVoteSchema,
  type Meeting,
  type MeetingAttendeesResponse,
  type MeetingListResponse,
  type MeetingVote,
  type MeetingVotesResponse,
  SubmitVoteSchema,
  UpdateMeetingSchema,
  type VoteCountersResponse,
} from './models.ts'
import { problem } from '../response.ts'

const router = Router()

const canAdminMeeting = (req: Request) =>
  req.user?.permissions.includes(MIKPermissions.MEETING_ADMIN) ?? false

const parseBody = <T extends object>(schema: z.ZodType<T>, body: unknown, detail: string): T => {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail,
      extensions: { errors: parsed.error.issues },
    })
  }

  return parsed.data
}

router.get(
  '/active',
  validateUser(MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN),
  async (req: Request, res: Response<Meeting | null>) => {
    const meeting = await getActiveMeeting(req.user!.memberId)
    return res.status(HttpStatusCode.Ok).json(meeting ?? null)
  },
)

router.get(
  '/',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request, res: Response<MeetingListResponse>) => {
    const meetings = await getMeetings(req.user!.memberId)
    return res.status(HttpStatusCode.Ok).json({ meetings })
  },
)

router.post(
  '/',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request, res: Response<Meeting>) => {
    const data = parseBody(CreateMeetingSchema, req.body, 'Invalid meeting data')
    const meeting = await createMeeting(data, req.user!.memberId)
    return res.status(HttpStatusCode.Created).json(meeting)
  },
)

router.get(
  '/:id',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Meeting>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    return res.status(HttpStatusCode.Ok).json(meeting)
  },
)

router.patch(
  '/:id',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Meeting>) => {
    const existing = await getMeetingById(req.params.id, req.user!.memberId)
    if (!existing) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }
    if (existing.status !== 'DRAFT') {
      return problem({ status: 409, detail: 'Only draft meetings can be edited' })
    }

    const data = parseBody(UpdateMeetingSchema, req.body, 'Invalid meeting data')
    const meeting = await updateMeeting(req.params.id, data, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 500, detail: 'Failed to update meeting' })
    }

    return res.status(HttpStatusCode.Ok).json(meeting)
  },
)

router.delete(
  '/:id',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response) => {
    const existing = await getMeetingById(req.params.id, req.user!.memberId)
    if (!existing) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }
    if (existing.status !== 'DRAFT') {
      return problem({ status: 409, detail: 'Only draft meetings can be deleted' })
    }

    const deleted = await deleteMeeting(req.params.id)
    if (!deleted) {
      return problem({ status: 500, detail: 'Failed to delete meeting' })
    }

    return res.status(HttpStatusCode.NoContent).end()
  },
)

router.post(
  '/:id/start',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Meeting>) => {
    const existing = await getMeetingById(req.params.id, req.user!.memberId)
    if (!existing) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }
    if (existing.status !== 'DRAFT') {
      return problem({ status: 409, detail: 'Only draft meetings can be started' })
    }

    const meeting = await startMeeting(req.params.id, req.user!.memberId, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 500, detail: 'Failed to start meeting' })
    }

    return res.status(HttpStatusCode.Ok).json(meeting)
  },
)

router.post(
  '/:id/pending-notes',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Meeting>) => {
    const existing = await getMeetingById(req.params.id, req.user!.memberId)
    if (!existing) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }
    if (existing.status !== 'ONGOING') {
      return problem({ status: 409, detail: 'Only ongoing meetings can move to pending notes' })
    }

    const meeting = await pendingNotesMeeting(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 500, detail: 'Failed to update meeting status' })
    }

    return res.status(HttpStatusCode.Ok).json(meeting)
  },
)

router.post(
  '/:id/end',
  validateUser(MIKPermissions.MEETING_ADMIN),
  documentUpload.single('file'),
  async (req: Request<{ id: string }>, res: Response<Meeting>) => {
    const existing = await getMeetingById(req.params.id, req.user!.memberId)
    if (!existing) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }
    if (existing.status !== 'PENDING_NOTES') {
      return problem({ status: 409, detail: 'Only pending-notes meetings can be ended' })
    }
    if (!req.file) {
      return problem({
        status: 400,
        detail: 'Meeting notes document is required to close a meeting',
      })
    }

    let notesDocumentId: number
    try {
      // Prefix with the meeting ID so re-used filenames (e.g. every secretary's
      // "poytakirja.pdf") can't collide and overwrite a previous meeting's notes.
      const storageFileName = `${existing.meetingId}-${req.file.originalname}`
      const uploadResult = await storageService.uploadFile(
        req.file.buffer,
        storageFileName,
        req.file.mimetype,
        DocumentCategory.MINUTES,
      )

      const document = UpsertSchema(DocumentSchema).parse({
        title: existing.title,
        description: `Meeting notes for "${existing.title}"`,
        category: DocumentCategory.MINUTES,
        documentUrl: uploadResult.url,
        publishedDate: new Date().toISOString().slice(0, 10),
        isPublic: true,
        isArchived: false,
        tags: ['meeting-notes', existing.meetingId],
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageKey: uploadResult.key,
      })

      const created = await addDocument(document, req.user!)
      notesDocumentId = created.documentId!
    } catch (error) {
      logger.error('Meeting notes upload failed:', error)
      return problem({ status: 500, detail: 'Failed to upload meeting notes document' })
    }

    const meeting = await endMeeting(
      req.params.id,
      req.user!.memberId,
      notesDocumentId,
      req.user!.memberId,
    )
    if (!meeting) {
      return problem({ status: 500, detail: 'Failed to end meeting' })
    }

    return res.status(HttpStatusCode.Ok).json(meeting)
  },
)

router.get(
  '/:id/attendance',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<MeetingAttendeesResponse>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const attendees = await getMeetingAttendees(req.params.id)
    return res.status(HttpStatusCode.Ok).json({ attendees })
  },
)

router.get(
  '/:id/vote-counters',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<VoteCountersResponse>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const voteCounters = await getVoteCounters(req.params.id)
    return res.status(HttpStatusCode.Ok).json({ voteCounters })
  },
)

router.post(
  '/:id/vote-counters',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<VoteCountersResponse>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const data = parseBody(AddVoteCounterSchema, req.body, 'Invalid vote counter payload')
    await addVoteCounter(req.params.id, data.memberId, req.user!.memberId)
    const voteCounters = await getVoteCounters(req.params.id)
    return res.status(HttpStatusCode.Created).json({ voteCounters })
  },
)

router.delete(
  '/:id/vote-counters/:memberId',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string; memberId: string }>, res: Response) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const removed = await removeVoteCounter(req.params.id, req.params.memberId)
    if (!removed) {
      return problem({ status: 404, detail: 'Vote counter not found' })
    }

    return res.status(HttpStatusCode.NoContent).end()
  },
)

router.post(
  '/:id/votes',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<MeetingVote>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const data = parseBody(CreateVoteSchema, req.body, 'Invalid vote data')
    const vote = await createVote(req.params.id, data, req.user!.memberId)
    return res.status(HttpStatusCode.Created).json(vote)
  },
)

router.get(
  '/:id/votes',
  validateUser(MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<MeetingVotesResponse>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const isAdmin = canAdminMeeting(req)
    if (!isAdmin) {
      const attendee = await isAttendee(req.params.id, req.user!.memberId)
      if (!attendee) {
        return problem({ status: 403, detail: 'Attendance registration is required to view votes' })
      }
    }

    const includeResults = await isVoteCounter(req.params.id, req.user!.memberId)
    const votes = await getMeetingVotes(req.params.id, includeResults, req.user!.memberId)
    return res.status(HttpStatusCode.Ok).json({ votes })
  },
)

router.post(
  '/:id/votes/:voteId/open',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string; voteId: string }>, res: Response<MeetingVote>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const vote = await getMeetingVoteById(req.params.voteId, true, req.user!.memberId)
    if (!vote || vote.meetingId !== req.params.id) {
      return problem({ status: 404, detail: 'Vote not found' })
    }

    const opened = await openVote(req.params.voteId, req.user!.memberId, req.user!.memberId)
    if (!opened) {
      return problem({ status: 500, detail: 'Failed to open vote' })
    }

    return res.status(HttpStatusCode.Ok).json(opened)
  },
)

router.patch(
  '/:id/votes/:voteId/close',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string; voteId: string }>, res: Response<MeetingVote>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const vote = await getMeetingVoteById(req.params.voteId, true, req.user!.memberId)
    if (!vote || vote.meetingId !== req.params.id) {
      return problem({ status: 404, detail: 'Vote not found' })
    }
    if (vote.status !== 'OPEN') {
      return problem({ status: 409, detail: 'Only open votes can be closed' })
    }

    const closed = await closeVote(req.params.voteId, req.user!.memberId, req.user!.memberId)
    if (!closed) {
      return problem({ status: 500, detail: 'Failed to close vote' })
    }

    return res.status(HttpStatusCode.Ok).json(closed)
  },
)

router.patch(
  '/:id/votes/:voteId/abandon',
  validateUser(MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string; voteId: string }>, res: Response<MeetingVote>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const vote = await getMeetingVoteById(req.params.voteId, true, req.user!.memberId)
    if (!vote || vote.meetingId !== req.params.id) {
      return problem({ status: 404, detail: 'Vote not found' })
    }
    if (vote.status !== 'OPEN') {
      return problem({ status: 409, detail: 'Only open votes can be abandoned' })
    }

    const abandoned = await abandonVote(req.params.voteId, req.user!.memberId, req.user!.memberId)
    if (!abandoned) {
      return problem({ status: 500, detail: 'Failed to abandon vote' })
    }

    return res.status(HttpStatusCode.Ok).json(abandoned)
  },
)

router.get(
  '/:id/votes/:voteId/results',
  validateUser(MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string; voteId: string }>, res: Response<MeetingVote>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const canSeeResults = await isVoteCounter(req.params.id, req.user!.memberId)
    if (!canSeeResults) {
      return problem({ status: 403, detail: 'Only vote counters can view vote results' })
    }

    const vote = await getMeetingVoteById(req.params.voteId, true, req.user!.memberId)
    if (!vote || vote.meetingId !== req.params.id) {
      return problem({ status: 404, detail: 'Vote not found' })
    }

    return res.status(HttpStatusCode.Ok).json(vote)
  },
)

router.post(
  '/:id/attend',
  validateUser(MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Meeting>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    await registerAttendance(req.params.id, req.user!.memberId)
    const updated = await getMeetingById(req.params.id, req.user!.memberId)
    if (!updated) {
      return problem({
        status: 500,
        detail: 'Failed to load meeting after attendance registration',
      })
    }

    return res.status(HttpStatusCode.Ok).json(updated)
  },
)

router.post(
  '/:id/votes/:voteId/submit',
  validateUser(MIKPermissions.MEETING_USER, MIKPermissions.MEETING_ADMIN),
  async (req: Request<{ id: string; voteId: string }>, res: Response<MeetingVote>) => {
    const meeting = await getMeetingById(req.params.id, req.user!.memberId)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    const attendee = await isAttendee(req.params.id, req.user!.memberId)
    if (!attendee) {
      return problem({ status: 403, detail: 'Attendance registration is required before voting' })
    }

    const vote = await getMeetingVoteById(req.params.voteId, true, req.user!.memberId)
    if (!vote || vote.meetingId !== req.params.id) {
      return problem({ status: 404, detail: 'Vote not found' })
    }

    const data = parseBody(SubmitVoteSchema, req.body, 'Invalid vote submission')
    await submitVote(req.params.voteId, req.user!.memberId, data.optionIds)

    const includeResults = await isVoteCounter(req.params.id, req.user!.memberId)
    const updatedVote = await getMeetingVoteById(
      req.params.voteId,
      includeResults,
      req.user!.memberId,
    )
    if (!updatedVote) {
      return problem({ status: 500, detail: 'Failed to load vote after submission' })
    }

    return res.status(HttpStatusCode.Ok).json(updatedVote)
  },
)

export { router }
export default router
