import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

import { MIKPermissions } from '../../../src/routes/members/models.ts'
import type { updateMeeting } from '../../../src/db/meeting-queries.ts'

const mockAbandonVote = jest.fn<() => Promise<unknown>>()
const mockAddVoteCounter = jest.fn<() => Promise<void>>()
const mockCloseVote = jest.fn<() => Promise<unknown>>()
const mockCreateMeeting = jest.fn<() => Promise<unknown>>()
const mockCreateVote = jest.fn<() => Promise<unknown>>()
const mockDeleteMeeting = jest.fn<() => Promise<boolean>>()
const mockEndMeeting = jest.fn<() => Promise<unknown>>()
const mockGetActiveMeeting = jest.fn<() => Promise<unknown>>()
const mockGetMeetingAttendees = jest.fn<() => Promise<unknown[]>>()
const mockGetMeetingById = jest.fn<() => Promise<unknown>>()
const mockGetMeetings = jest.fn<() => Promise<unknown[]>>()
const mockGetMeetingVoteById = jest.fn<() => Promise<unknown>>()
const mockGetMeetingVotes = jest.fn<() => Promise<unknown[]>>()
const mockGetVoteCounters = jest.fn<() => Promise<unknown[]>>()
const mockIsAttendee = jest.fn<() => Promise<boolean>>()
const mockIsVoteCounter = jest.fn<() => Promise<boolean>>()
const mockOpenVote = jest.fn<() => Promise<unknown>>()
const mockPendingNotesMeeting = jest.fn<() => Promise<unknown>>()
const mockRegisterAttendance = jest.fn<() => Promise<void>>()
const mockRemoveVoteCounter = jest.fn<() => Promise<boolean>>()
const mockStartMeeting = jest.fn<() => Promise<unknown>>()
const mockSubmitVote = jest.fn<() => Promise<void>>()
const mockUpdateMeeting = jest.fn<typeof updateMeeting>()

jest.unstable_mockModule('../../../src/db/meeting-queries.ts', () => ({
  abandonVote: mockAbandonVote,
  addVoteCounter: mockAddVoteCounter,
  closeVote: mockCloseVote,
  createMeeting: mockCreateMeeting,
  createVote: mockCreateVote,
  deleteMeeting: mockDeleteMeeting,
  endMeeting: mockEndMeeting,
  getActiveMeeting: mockGetActiveMeeting,
  getMeetingAttendees: mockGetMeetingAttendees,
  getMeetingById: mockGetMeetingById,
  getMeetings: mockGetMeetings,
  getMeetingVoteById: mockGetMeetingVoteById,
  getMeetingVotes: mockGetMeetingVotes,
  getVoteCounters: mockGetVoteCounters,
  isAttendee: mockIsAttendee,
  isVoteCounter: mockIsVoteCounter,
  openVote: mockOpenVote,
  pendingNotesMeeting: mockPendingNotesMeeting,
  registerAttendance: mockRegisterAttendance,
  removeVoteCounter: mockRemoveVoteCounter,
  startMeeting: mockStartMeeting,
  submitVote: mockSubmitVote,
  updateMeeting: mockUpdateMeeting,
}))

jest.unstable_mockModule('../../../src/db/document-queries.ts', () => ({
  addDocument: jest.fn(),
}))

jest.unstable_mockModule('../../../src/services/storage.ts', () => ({
  storageService: {
    uploadFile: jest.fn(),
  },
}))

jest.unstable_mockModule('../../../src/util/documentHelper.ts', () => ({
  documentUpload: {
    single: () => (req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
  },
}))

let mockUserPermissions: MIKPermissions[] = []

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser:
    (...permissions: MIKPermissions[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.user = {
        memberId: 'test-admin',
        lastName: 'Admin',
        email: 'admin@test.com',
        roles: [],
        permissions: mockUserPermissions,
        canMakeReservations: true,
      }

      if (
        permissions.length === 0 ||
        permissions.some((permission) => mockUserPermissions.includes(permission))
      ) {
        return next()
      }

      return res.status(403).json({ status: 403, title: 'Forbidden', detail: 'Protected Content' })
    },
}))

const { router } = await import('../../../src/routes/meetings/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/meetings', router)
app.use(problemErrorHandler)

const meetingId = '11111111-1111-4111-8111-111111111111'
const voteId = '22222222-2222-4222-8222-222222222222'

const draftMeeting = {
  meetingId,
  title: 'Draft meeting',
  description: null,
  documentSearchFilter: null,
  meetingUrl: null,
  status: 'DRAFT' as const,
  createdBy: 'test-admin',
  createdAt: '2026-01-01T10:00:00.000Z',
  startedAt: null,
  endedAt: null,
  meetingNotesDocumentId: null,
  attendanceCount: 0,
  isAttending: false,
  isVoteCounter: false,
}

describe('Meetings API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserPermissions = [MIKPermissions.MEETING_ADMIN]
  })

  it('does not allow editing ended meetings', async () => {
    mockGetMeetingById.mockResolvedValue({ ...draftMeeting, status: 'ENDED' })

    const response = await request(app).patch(`/api/v1/meetings/${meetingId}`).send({
      title: 'Updated title',
    })

    expect(response.status).toBe(409)
    expect(response.body.detail).toBe('Ended meetings cannot be edited')
    expect(mockUpdateMeeting).not.toHaveBeenCalled()
  })

  it('allows updating meetingUrl during an ongoing meeting', async () => {
    const ongoingMeeting = {
      ...draftMeeting,
      status: 'ONGOING' as const,
      startedAt: '2026-01-01T11:00:00.000Z',
    }
    mockGetMeetingById.mockResolvedValueOnce(ongoingMeeting)
    mockUpdateMeeting.mockResolvedValue({
      ...ongoingMeeting,
      meetingUrl: 'https://meet.example.com/abc',
    })

    const response = await request(app).patch(`/api/v1/meetings/${meetingId}`).send({
      meetingUrl: 'https://meet.example.com/abc',
    })

    expect(response.status).toBe(200)
    expect(response.body.meetingUrl).toBe('https://meet.example.com/abc')
    expect(mockUpdateMeeting).toHaveBeenCalledWith(
      meetingId,
      { meetingUrl: 'https://meet.example.com/abc' },
      'test-admin',
    )
  })

  it('updates a draft meeting', async () => {
    mockGetMeetingById.mockResolvedValueOnce(draftMeeting)
    mockUpdateMeeting.mockResolvedValue({ ...draftMeeting, title: 'Updated title' })

    const response = await request(app).patch(`/api/v1/meetings/${meetingId}`).send({
      title: 'Updated title',
    })

    expect(response.status).toBe(200)
    expect(response.body.title).toBe('Updated title')
    expect(mockUpdateMeeting).toHaveBeenCalledWith(
      meetingId,
      { title: 'Updated title' },
      'test-admin',
    )
  })

  it('requires attendance before voting', async () => {
    mockUserPermissions = [MIKPermissions.MEETING_USER]
    mockGetMeetingById.mockResolvedValue(draftMeeting)
    mockIsAttendee.mockResolvedValue(false)

    const response = await request(app)
      .post(`/api/v1/meetings/${meetingId}/votes/${voteId}/submit`)
      .send({ optionIds: [voteId] })

    expect(response.status).toBe(403)
    expect(response.body.detail).toBe('Attendance registration is required before voting')
    expect(mockSubmitVote).not.toHaveBeenCalled()
  })
})
