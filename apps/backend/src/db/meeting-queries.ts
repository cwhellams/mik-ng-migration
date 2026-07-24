import { sql, type Kysely, type Transaction } from 'kysely'

import { db } from './connection.ts'
import type { DB } from './schema.d.ts'
import {
  type CreateMeeting,
  type CreateVote,
  type Meeting,
  type MeetingAttendee,
  type MeetingVote,
  type UpdateMeeting,
  type VoteCounter,
  type VoteOption,
} from '../routes/meetings/models.ts'
import { problem } from '../routes/response.ts'

type Executor = Kysely<DB> | Transaction<DB>

type MeetingRow = {
  meeting_id: string
  title: string
  description: string | null
  document_search_filter: string | null
  status: 'DRAFT' | 'ONGOING' | 'PENDING_NOTES' | 'ENDED'
  created_by: string | null
  created_at: unknown
  started_at: unknown
  ended_at: unknown
  attendance_count: number
  is_attending: boolean
  is_vote_counter: boolean
}

type MeetingVoteRow = {
  vote_id: string
  meeting_id: string
  topic: string
  description: string | null
  is_multi_select: boolean
  max_selections: number | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  created_at: unknown
  created_by: string | null
  closed_at: unknown
  closed_by: string | null
  display_order: number
  total_votes: number
  has_voted: boolean
}

type VoteOptionRow = {
  option_id: string
  vote_id: string
  option_text: string
  display_order: number
  vote_count: number
}

type MeetingAttendeeRow = {
  member_id: string
  first_name: string
  last_name: string
  email: string | null
  joined_at: unknown
}

type VoteCounterRow = {
  member_id: string
  first_name: string
  last_name: string
  email: string | null
  assigned_at: unknown
  assigned_by: string | null
}

type VoteMetaRow = {
  vote_id: string
  meeting_id: string
  meeting_status: 'DRAFT' | 'ONGOING' | 'ENDED'
  vote_status: 'DRAFT' | 'OPEN' | 'CLOSED'
  is_multi_select: boolean
  max_selections: number | null
}

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date(String(value)).toISOString()
}

const toNullableIsoString = (value: unknown): string | null => {
  if (value == null) {
    return null
  }

  return toIsoString(value)
}

const mapMeeting = (row: MeetingRow): Meeting => ({
  meetingId: row.meeting_id,
  title: row.title,
  description: row.description,
  documentSearchFilter: row.document_search_filter,
  status: row.status,
  createdBy: row.created_by,
  createdAt: toIsoString(row.created_at),
  startedAt: toNullableIsoString(row.started_at),
  endedAt: toNullableIsoString(row.ended_at),
  attendanceCount: Number(row.attendance_count ?? 0),
  isAttending: Boolean(row.is_attending),
  isVoteCounter: Boolean(row.is_vote_counter),
})

const mapVoteOption = (
  row: VoteOptionRow,
  includeResults: boolean,
  voteStatus: 'DRAFT' | 'OPEN' | 'CLOSED',
): VoteOption => ({
  optionId: row.option_id,
  voteId: row.vote_id,
  optionText: row.option_text,
  displayOrder: Number(row.display_order ?? 0),
  // Results are only revealed once the vote is closed
  voteCount: includeResults && voteStatus === 'CLOSED' ? Number(row.vote_count ?? 0) : null,
})

const mapMeetingVote = (
  row: MeetingVoteRow,
  options: VoteOption[],
  includeResults: boolean,
): MeetingVote => ({
  voteId: row.vote_id,
  meetingId: row.meeting_id,
  topic: row.topic,
  description: row.description,
  isMultiSelect: row.is_multi_select,
  maxSelections: row.max_selections,
  status: row.status,
  createdAt: toIsoString(row.created_at),
  createdBy: row.created_by,
  closedAt: toNullableIsoString(row.closed_at),
  closedBy: row.closed_by,
  displayOrder: Number(row.display_order ?? 0),
  // Results are only revealed once the vote is closed
  totalVotes: includeResults && row.status === 'CLOSED' ? Number(row.total_votes ?? 0) : null,
  hasVoted: Boolean(row.has_voted),
  options,
})

const getMeetingRows = async (
  executor: Executor,
  memberId?: string,
  meetingId?: string,
  status?: 'DRAFT' | 'ONGOING' | 'PENDING_NOTES' | 'ENDED',
): Promise<MeetingRow[]> => {
  const { rows } = await sql<MeetingRow>`
    SELECT
      m.meeting_id,
      m.title,
      m.description,
      m.document_search_filter,
      m.status,
      m.created_by,
      m.created_at,
      m.started_at,
      m.ended_at,
      COALESCE(att.attendance_count, 0)::int AS attendance_count,
      EXISTS (
        SELECT 1
        FROM member.meeting_attendance ma
        WHERE ma.meeting_id = m.meeting_id
          AND ma.member_id = ${memberId ?? null}
      ) AS is_attending,
      EXISTS (
        SELECT 1
        FROM member.meeting_vote_counter mvc
        WHERE mvc.meeting_id = m.meeting_id
          AND mvc.member_id = ${memberId ?? null}
      ) AS is_vote_counter
    FROM member.meeting m
    LEFT JOIN (
      SELECT meeting_id, COUNT(*)::int AS attendance_count
      FROM member.meeting_attendance
      GROUP BY meeting_id
    ) att ON att.meeting_id = m.meeting_id
    WHERE (${meetingId ?? null}::uuid IS NULL OR m.meeting_id = ${meetingId ?? null}::uuid)
      AND (${status ?? null}::text IS NULL OR m.status = ${status ?? null})
    ORDER BY
      CASE m.status WHEN 'ONGOING' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
      COALESCE(m.started_at, m.created_at) DESC,
      m.created_at DESC
  `.execute(executor)

  return rows
}

const getVoteRows = async (
  executor: Executor,
  meetingId: string,
  includeResults: boolean,
  memberId?: string,
  voteId?: string,
): Promise<MeetingVote[]> => {
  const { rows: voteRows } = await sql<MeetingVoteRow>`
    SELECT
      v.vote_id,
      v.meeting_id,
      v.topic,
      v.description,
      v.is_multi_select,
      v.max_selections,
      v.status,
      v.created_at,
      v.created_by,
      v.closed_at,
      v.closed_by,
      v.display_order,
      COALESCE(vc.total_votes, 0)::int AS total_votes,
      EXISTS (
        SELECT 1
        FROM member.vote_cast casted
        WHERE casted.vote_id = v.vote_id
          AND casted.member_id = ${memberId ?? null}
      ) AS has_voted
    FROM member.meeting_vote v
    LEFT JOIN (
      SELECT vote_id, COUNT(*)::int AS total_votes
      FROM member.vote_cast
      GROUP BY vote_id
    ) vc ON vc.vote_id = v.vote_id
    WHERE v.meeting_id = ${meetingId}::uuid
      AND (${voteId ?? null}::uuid IS NULL OR v.vote_id = ${voteId ?? null}::uuid)
    ORDER BY v.display_order ASC, v.created_at ASC
  `.execute(executor)

  if (!voteRows.length) {
    return []
  }

  const { rows: optionRows } = await sql<VoteOptionRow>`
    SELECT
      o.option_id,
      o.vote_id,
      o.option_text,
      o.display_order,
      COALESCE(sel.vote_count, 0)::int AS vote_count
    FROM member.vote_option o
    LEFT JOIN (
      SELECT option_id, COUNT(*)::int AS vote_count
      FROM member.vote_selection
      GROUP BY option_id
    ) sel ON sel.option_id = o.option_id
    WHERE o.vote_id IN (${sql.join(voteRows.map((row) => sql`${row.vote_id}::uuid`))})
    ORDER BY o.vote_id ASC, o.display_order ASC, o.option_text ASC
  `.execute(executor)

  const optionsByVote = new Map<string, VoteOption[]>()
  for (const optionRow of optionRows) {
    const voteRow = voteRows.find((r) => r.vote_id === optionRow.vote_id)
    const options = optionsByVote.get(optionRow.vote_id) ?? []
    options.push(mapVoteOption(optionRow, includeResults, voteRow?.status ?? 'OPEN'))
    optionsByVote.set(optionRow.vote_id, options)
  }

  return voteRows.map((row) =>
    mapMeetingVote(row, optionsByVote.get(row.vote_id) ?? [], includeResults),
  )
}

const getVoteMeta = async (
  executor: Executor,
  voteId: string,
): Promise<VoteMetaRow | undefined> => {
  const { rows } = await sql<VoteMetaRow>`
    SELECT
      v.vote_id,
      v.meeting_id,
      m.status AS meeting_status,
      v.status AS vote_status,
      v.is_multi_select,
      v.max_selections
    FROM member.meeting_vote v
    INNER JOIN member.meeting m ON m.meeting_id = v.meeting_id
    WHERE v.vote_id = ${voteId}::uuid
    LIMIT 1
  `.execute(executor)

  return rows[0]
}

export const getMeetings = async (memberId?: string): Promise<Meeting[]> => {
  const rows = await getMeetingRows(db, memberId)
  return rows.map(mapMeeting)
}

export const getMeetingById = async (
  meetingId: string,
  memberId?: string,
): Promise<Meeting | undefined> => {
  const rows = await getMeetingRows(db, memberId, meetingId)
  return rows[0] ? mapMeeting(rows[0]) : undefined
}

export const getActiveMeeting = async (memberId: string): Promise<Meeting | undefined> => {
  // ONGOING → visible to all members
  // PENDING_NOTES → visible only to vote counters (meeting is over for regular members)
  const { rows } = await sql<MeetingRow>`
    SELECT
      m.meeting_id,
      m.title,
      m.description,
      m.document_search_filter,
      m.status,
      m.created_by,
      m.created_at,
      m.started_at,
      m.ended_at,
      COALESCE(att.attendance_count, 0)::int AS attendance_count,
      EXISTS (
        SELECT 1
        FROM member.meeting_attendance ma
        WHERE ma.meeting_id = m.meeting_id
          AND ma.member_id = ${memberId}
      ) AS is_attending,
      EXISTS (
        SELECT 1
        FROM member.meeting_vote_counter mvc
        WHERE mvc.meeting_id = m.meeting_id
          AND mvc.member_id = ${memberId}
      ) AS is_vote_counter
    FROM member.meeting m
    LEFT JOIN (
      SELECT meeting_id, COUNT(*)::int AS attendance_count
      FROM member.meeting_attendance
      GROUP BY meeting_id
    ) att ON att.meeting_id = m.meeting_id
    WHERE m.status = 'ONGOING'
       OR (
         m.status = 'PENDING_NOTES'
         AND EXISTS (
           SELECT 1
           FROM member.meeting_vote_counter mvc
           WHERE mvc.meeting_id = m.meeting_id
             AND mvc.member_id = ${memberId}
         )
       )
    ORDER BY m.started_at DESC
    LIMIT 1
  `.execute(db)

  return rows[0] ? mapMeeting(rows[0]) : undefined
}

export const createMeeting = async (data: CreateMeeting, createdBy: string): Promise<Meeting> => {
  const { rows } = await sql<{ meeting_id: string }>`
    INSERT INTO member.meeting (
      title,
      description,
      document_search_filter,
      created_by
    )
    VALUES (
      ${data.title},
      ${data.description ?? null},
      ${data.documentSearchFilter ?? null},
      ${createdBy}
    )
    RETURNING meeting_id
  `.execute(db)

  const meetingId = rows[0]?.meeting_id
  if (!meetingId) {
    return problem({ status: 500, detail: 'Failed to create meeting' })
  }

  const meeting = await getMeetingById(meetingId, createdBy)
  if (!meeting) {
    return problem({ status: 500, detail: 'Meeting not found after creation' })
  }

  return meeting
}

export const updateMeeting = async (
  meetingId: string,
  data: UpdateMeeting,
  memberId?: string,
): Promise<Meeting | undefined> => {
  const { rows } = await sql<{ meeting_id: string }>`
    UPDATE member.meeting
    SET
      title = CASE WHEN ${data.title !== undefined} THEN ${data.title ?? ''} ELSE title END,
      description = CASE
        WHEN ${Object.prototype.hasOwnProperty.call(data, 'description')}
          THEN ${data.description ?? null}
        ELSE description
      END,
      document_search_filter = CASE
        WHEN ${Object.prototype.hasOwnProperty.call(data, 'documentSearchFilter')}
          THEN ${data.documentSearchFilter ?? null}
        ELSE document_search_filter
      END
    WHERE meeting_id = ${meetingId}::uuid
      AND status = 'DRAFT'
    RETURNING meeting_id
  `.execute(db)

  return rows[0] ? getMeetingById(meetingId, memberId) : undefined
}

export const deleteMeeting = async (meetingId: string): Promise<boolean> => {
  const { rows } = await sql<{ deleted: boolean }>`
    DELETE FROM member.meeting
    WHERE meeting_id = ${meetingId}::uuid
      AND status = 'DRAFT'
    RETURNING TRUE AS deleted
  `.execute(db)

  return Boolean(rows[0]?.deleted)
}

export const startMeeting = async (
  meetingId: string,
  _startedBy: string,
  memberId?: string,
): Promise<Meeting | undefined> => {
  const ongoing = await getActiveMeeting(_startedBy)
  if (ongoing && ongoing.meetingId !== meetingId) {
    return problem({ status: 409, detail: 'Another meeting is already ongoing' })
  }

  const { rows } = await sql<{ meeting_id: string }>`
    UPDATE member.meeting
    SET
      status = 'ONGOING',
      started_at = COALESCE(started_at, NOW())
    WHERE meeting_id = ${meetingId}::uuid
      AND status = 'DRAFT'
    RETURNING meeting_id
  `.execute(db)

  return rows[0] ? getMeetingById(meetingId, memberId ?? _startedBy) : undefined
}

export const pendingNotesMeeting = async (
  meetingId: string,
  memberId?: string,
): Promise<Meeting | undefined> => {
  const { rows } = await sql<{ meeting_id: string }>`
    UPDATE member.meeting
    SET status = 'PENDING_NOTES'
    WHERE meeting_id = ${meetingId}::uuid
      AND status = 'ONGOING'
    RETURNING meeting_id
  `.execute(db)

  return rows[0] ? getMeetingById(meetingId, memberId) : undefined
}

export const endMeeting = async (
  meetingId: string,
  _endedBy: string,
  memberId?: string,
): Promise<Meeting | undefined> => {
  const { rows } = await sql<{ meeting_id: string }>`
    UPDATE member.meeting
    SET
      status = 'ENDED',
      ended_at = NOW()
    WHERE meeting_id = ${meetingId}::uuid
      AND status IN ('ONGOING', 'PENDING_NOTES')
    RETURNING meeting_id
  `.execute(db)

  return rows[0] ? getMeetingById(meetingId, memberId ?? _endedBy) : undefined
}

export const registerAttendance = async (meetingId: string, memberId: string): Promise<void> => {
  const meeting = await getMeetingById(meetingId, memberId)
  if (!meeting) {
    return problem({ status: 404, detail: 'Meeting not found' })
  }

  if (meeting.status !== 'ONGOING') {
    return problem({ status: 409, detail: 'Only ongoing meetings can be attended' })
  }

  await sql`
    INSERT INTO member.meeting_attendance (meeting_id, member_id)
    VALUES (${meetingId}::uuid, ${memberId})
    ON CONFLICT (meeting_id, member_id) DO NOTHING
  `.execute(db)
}

export const getMeetingAttendees = async (meetingId: string): Promise<MeetingAttendee[]> => {
  const { rows } = await sql<MeetingAttendeeRow>`
    SELECT
      ma.member_id,
      r.first_name,
      r.last_name,
      r.email,
      ma.joined_at
    FROM member.meeting_attendance ma
    INNER JOIN member.register r ON r.member_id = ma.member_id
    WHERE ma.meeting_id = ${meetingId}::uuid
    ORDER BY r.first_name ASC, r.last_name ASC
  `.execute(db)

  return rows.map((row) => ({
    memberId: row.member_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    joinedAt: toIsoString(row.joined_at),
  }))
}

export const getVoteCounters = async (meetingId: string): Promise<VoteCounter[]> => {
  const { rows } = await sql<VoteCounterRow>`
    SELECT
      mvc.member_id,
      r.first_name,
      r.last_name,
      r.email,
      mvc.assigned_at,
      mvc.assigned_by
    FROM member.meeting_vote_counter mvc
    INNER JOIN member.register r ON r.member_id = mvc.member_id
    WHERE mvc.meeting_id = ${meetingId}::uuid
    ORDER BY r.first_name ASC, r.last_name ASC
  `.execute(db)

  return rows.map((row) => ({
    memberId: row.member_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    assignedAt: toIsoString(row.assigned_at),
    assignedBy: row.assigned_by,
  }))
}

export const addVoteCounter = async (
  meetingId: string,
  memberId: string,
  assignedBy: string,
): Promise<void> => {
  await sql`
    INSERT INTO member.meeting_vote_counter (meeting_id, member_id, assigned_by)
    VALUES (${meetingId}::uuid, ${memberId}, ${assignedBy})
    ON CONFLICT (meeting_id, member_id) DO NOTHING
  `.execute(db)
}

export const removeVoteCounter = async (meetingId: string, memberId: string): Promise<boolean> => {
  const { rows } = await sql<{ deleted: boolean }>`
    DELETE FROM member.meeting_vote_counter
    WHERE meeting_id = ${meetingId}::uuid
      AND member_id = ${memberId}
    RETURNING TRUE AS deleted
  `.execute(db)

  return Boolean(rows[0]?.deleted)
}

export const createVote = async (
  meetingId: string,
  data: CreateVote,
  createdBy: string,
): Promise<MeetingVote> => {
  const voteId = await db.transaction().execute(async (trx) => {
    const meeting = await getMeetingById(meetingId, createdBy)
    if (!meeting) {
      return problem({ status: 404, detail: 'Meeting not found' })
    }

    if (meeting.status === 'ENDED') {
      return problem({ status: 409, detail: 'Cannot add votes to an ended meeting' })
    }

    const { rows: orderRows } = await sql<{ next_order: number }>`
      SELECT COALESCE(MAX(display_order), -10) + 10 AS next_order
      FROM member.meeting_vote
      WHERE meeting_id = ${meetingId}::uuid
    `.execute(trx)

    const { rows } = await sql<{ vote_id: string }>`
      INSERT INTO member.meeting_vote (
        meeting_id,
        topic,
        description,
        is_multi_select,
        max_selections,
        created_by,
        display_order
      )
      VALUES (
        ${meetingId}::uuid,
        ${data.topic},
        ${data.description ?? null},
        ${data.isMultiSelect},
        ${data.isMultiSelect ? (data.maxSelections ?? null) : null},
        ${createdBy},
        ${Number(orderRows[0]?.next_order ?? 0)}
      )
      RETURNING vote_id
    `.execute(trx)

    const newVoteId = rows[0]?.vote_id
    if (!newVoteId) {
      return problem({ status: 500, detail: 'Failed to create vote' })
    }

    for (const [index, optionText] of data.options.entries()) {
      await sql`
        INSERT INTO member.vote_option (
          vote_id,
          option_text,
          display_order
        )
        VALUES (
          ${newVoteId}::uuid,
          ${optionText},
          ${index * 10}
        )
      `.execute(trx)
    }

    return newVoteId
  })

  const vote = await getMeetingVoteById(voteId, true, createdBy)
  if (!vote) {
    return problem({ status: 500, detail: 'Vote not found after creation' })
  }

  return vote
}

export const openVote = async (
  voteId: string,
  _openedBy: string,
  memberId?: string,
): Promise<MeetingVote | undefined> => {
  const meta = await getVoteMeta(db, voteId)
  if (!meta) {
    return undefined
  }

  if (meta.meeting_status !== 'ONGOING') {
    return problem({ status: 409, detail: 'Voting can only be opened during an ongoing meeting' })
  }

  if (meta.vote_status === 'CLOSED') {
    return problem({ status: 409, detail: 'Closed votes cannot be reopened' })
  }

  const { rows: conflicting } = await sql<{ vote_id: string }>`
    SELECT vote_id
    FROM member.meeting_vote
    WHERE meeting_id = ${meta.meeting_id}::uuid
      AND status = 'OPEN'
      AND vote_id <> ${voteId}::uuid
    LIMIT 1
  `.execute(db)

  if (conflicting[0]) {
    return problem({ status: 409, detail: 'Another vote is already open' })
  }

  await sql`
    UPDATE member.meeting_vote
    SET status = 'OPEN'
    WHERE vote_id = ${voteId}::uuid
  `.execute(db)

  return getMeetingVoteById(voteId, true, memberId)
}

export const closeVote = async (
  voteId: string,
  closedBy: string,
  memberId?: string,
): Promise<MeetingVote | undefined> => {
  const { rows } = await sql<{ vote_id: string }>`
    UPDATE member.meeting_vote
    SET
      status = 'CLOSED',
      closed_at = NOW(),
      closed_by = ${closedBy}
    WHERE vote_id = ${voteId}::uuid
      AND status = 'OPEN'
    RETURNING vote_id
  `.execute(db)

  return rows[0] ? getMeetingVoteById(voteId, true, memberId ?? closedBy) : undefined
}

export const getMeetingVotes = async (
  meetingId: string,
  includeResults: boolean,
  memberId?: string,
): Promise<MeetingVote[]> => getVoteRows(db, meetingId, includeResults, memberId)

export const getMeetingVoteById = async (
  voteId: string,
  includeResults: boolean,
  memberId?: string,
): Promise<MeetingVote | undefined> => {
  const meta = await getVoteMeta(db, voteId)
  if (!meta) {
    return undefined
  }

  const votes = await getVoteRows(db, meta.meeting_id, includeResults, memberId, voteId)
  return votes[0]
}

export const hasVoted = async (voteId: string, memberId: string): Promise<boolean> => {
  const { rows } = await sql<{ has_voted: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM member.vote_cast
      WHERE vote_id = ${voteId}::uuid
        AND member_id = ${memberId}
    ) AS has_voted
  `.execute(db)

  return Boolean(rows[0]?.has_voted)
}

export const submitVote = async (
  voteId: string,
  memberId: string,
  optionIds: string[],
): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    const meta = await getVoteMeta(trx, voteId)
    if (!meta) {
      return problem({ status: 404, detail: 'Vote not found' })
    }

    if (meta.meeting_status !== 'ONGOING') {
      return problem({ status: 409, detail: 'Meeting is not ongoing' })
    }

    if (meta.vote_status !== 'OPEN') {
      return problem({ status: 409, detail: 'Vote is not open' })
    }

    if (!meta.is_multi_select && optionIds.length !== 1) {
      return problem({ status: 400, detail: 'Exactly one option must be selected' })
    }

    if (
      meta.is_multi_select &&
      meta.max_selections != null &&
      optionIds.length > meta.max_selections
    ) {
      return problem({ status: 400, detail: 'Too many options selected' })
    }

    const { rows: optionRows } = await sql<{ option_id: string }>`
      SELECT option_id
      FROM member.vote_option
      WHERE vote_id = ${voteId}::uuid
    `.execute(trx)

    const validOptionIds = new Set(optionRows.map((row) => row.option_id))
    const allValid = optionIds.every((optionId) => validOptionIds.has(optionId))
    if (!allValid) {
      return problem({ status: 400, detail: 'One or more selected options are invalid' })
    }

    const { rows: castRows } = await sql<{ cast_id: string }>`
      INSERT INTO member.vote_cast (vote_id, member_id)
      VALUES (${voteId}::uuid, ${memberId})
      ON CONFLICT (vote_id, member_id) DO NOTHING
      RETURNING cast_id
    `.execute(trx)

    if (!castRows[0]?.cast_id) {
      return problem({ status: 409, detail: 'Vote has already been submitted' })
    }

    for (const optionId of optionIds) {
      await sql`
        INSERT INTO member.vote_selection (vote_id, option_id)
        VALUES (${voteId}::uuid, ${optionId}::uuid)
      `.execute(trx)
    }
  })
}

export const isAttendee = async (meetingId: string, memberId: string): Promise<boolean> => {
  const { rows } = await sql<{ is_attendee: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM member.meeting_attendance
      WHERE meeting_id = ${meetingId}::uuid
        AND member_id = ${memberId}
    ) AS is_attendee
  `.execute(db)

  return Boolean(rows[0]?.is_attendee)
}

export const isVoteCounter = async (meetingId: string, memberId: string): Promise<boolean> => {
  const { rows } = await sql<{ is_vote_counter: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM member.meeting_vote_counter
      WHERE meeting_id = ${meetingId}::uuid
        AND member_id = ${memberId}
    ) AS is_vote_counter
  `.execute(db)

  return Boolean(rows[0]?.is_vote_counter)
}
