import { z } from 'zod'

export const MeetingStatusSchema = z.enum(['DRAFT', 'ONGOING', 'PENDING_NOTES', 'ENDED'])
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>

export const VoteStatusSchema = z.enum(['DRAFT', 'OPEN', 'CLOSED'])
export type VoteStatus = z.infer<typeof VoteStatusSchema>

export const VoteOptionSchema = z.object({
  optionId: z.string().guid(),
  voteId: z.string().guid(),
  optionText: z.string(),
  displayOrder: z.number().int(),
  voteCount: z.number().int().nonnegative().nullable().default(null),
})
export type VoteOption = z.infer<typeof VoteOptionSchema>

export const MeetingVoteSchema = z.object({
  voteId: z.string().guid(),
  meetingId: z.string().guid(),
  topic: z.string(),
  description: z.string().nullable(),
  isMultiSelect: z.boolean(),
  maxSelections: z.number().int().positive().nullable(),
  status: VoteStatusSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
  closedAt: z.string().datetime().nullable(),
  closedBy: z.string().nullable(),
  displayOrder: z.number().int(),
  totalVotes: z.number().int().nonnegative().nullable().default(null),
  hasVoted: z.boolean().default(false),
  options: z.array(VoteOptionSchema).default([]),
})
export type MeetingVote = z.infer<typeof MeetingVoteSchema>

export const MeetingSchema = z.object({
  meetingId: z.string().guid(),
  title: z.string(),
  description: z.string().nullable(),
  documentSearchFilter: z.string().nullable(),
  status: MeetingStatusSchema,
  createdBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  attendanceCount: z.number().int().nonnegative().default(0),
  isAttending: z.boolean().default(false),
  isVoteCounter: z.boolean().default(false),
})
export type Meeting = z.infer<typeof MeetingSchema>

export const MeetingAttendeeSchema = z.object({
  memberId: z.string().max(9),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().nullable(),
  joinedAt: z.string().datetime(),
})
export type MeetingAttendee = z.infer<typeof MeetingAttendeeSchema>

export const VoteCounterSchema = z.object({
  memberId: z.string().max(9),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().nullable(),
  assignedAt: z.string().datetime(),
  assignedBy: z.string().nullable(),
})
export type VoteCounter = z.infer<typeof VoteCounterSchema>

export const MeetingListResponseSchema = z.object({
  meetings: z.array(MeetingSchema),
})
export type MeetingListResponse = z.infer<typeof MeetingListResponseSchema>

export const MeetingVotesResponseSchema = z.object({
  votes: z.array(MeetingVoteSchema),
})
export type MeetingVotesResponse = z.infer<typeof MeetingVotesResponseSchema>

export const MeetingAttendeesResponseSchema = z.object({
  attendees: z.array(MeetingAttendeeSchema),
})
export type MeetingAttendeesResponse = z.infer<typeof MeetingAttendeesResponseSchema>

export const VoteCountersResponseSchema = z.object({
  voteCounters: z.array(VoteCounterSchema),
})
export type VoteCountersResponse = z.infer<typeof VoteCountersResponseSchema>

export const CreateMeetingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  documentSearchFilter: z.string().trim().max(500).nullable().optional(),
})
export type CreateMeeting = z.infer<typeof CreateMeetingSchema>

export const UpdateMeetingSchema = CreateMeetingSchema.partial()
export type UpdateMeeting = z.infer<typeof UpdateMeetingSchema>

export const CreateVoteSchema = z
  .object({
    topic: z.string().trim().min(1).max(500),
    description: z.string().trim().max(5000).nullable().optional(),
    options: z.array(z.string().trim().min(1).max(500)).min(2),
    isMultiSelect: z.boolean().default(false),
    maxSelections: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isMultiSelect && data.maxSelections != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxSelections is only allowed for multi-select votes',
        path: ['maxSelections'],
      })
    }

    if (data.maxSelections != null && data.maxSelections > data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxSelections cannot exceed the number of options',
        path: ['maxSelections'],
      })
    }
  })
export type CreateVote = z.infer<typeof CreateVoteSchema>

export const SubmitVoteSchema = z.object({
  optionIds: z
    .array(z.string().guid())
    .min(1)
    .refine((optionIds) => new Set(optionIds).size === optionIds.length, {
      message: 'optionIds must be unique',
    }),
})
export type SubmitVote = z.infer<typeof SubmitVoteSchema>

export const AddVoteCounterSchema = z.object({
  memberId: z.string().max(9),
})
export type AddVoteCounter = z.infer<typeof AddVoteCounterSchema>
