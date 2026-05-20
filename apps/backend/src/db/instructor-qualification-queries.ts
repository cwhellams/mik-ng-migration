import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  InstructorQualification,
  InstructorQualificationUpsert,
  InstructorQualificationHistory,
  InstructorStatusSummary,
  QualificationSnapshot,
  ProofDocumentCategory,
} from '../routes/instructor-qualifications/models.ts'
import {
  getLatestProofByCategory,
  getLatestProofIdsByMembers,
} from './qualification-proof-queries.ts'
import { getEventStore } from '../lib/eventStore.ts'
import {
  instructorQualificationStreamId,
  type InstructorQualificationEvent,
} from '../routes/instructor-qualifications/events.ts'
import {
  evolve,
  initialState,
  setQualifications,
  recordProofUploaded,
  recordNotificationSent,
} from '../routes/instructor-qualifications/decider.ts'

const INSTRUCTOR_ROLES = ['INSTRUCTOR', 'EXAMINER']

export async function getInstructorQualification(
  memberId: string,
): Promise<InstructorQualification | undefined> {
  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const { events } = await eventStore.readStream<InstructorQualificationEvent>(streamId)

  const setEvents = events.filter(e => e.type === 'InstructorQualificationSet')
  if (setEvents.length === 0) return undefined

  const state = setEvents.reduce(
    (s, e) => evolve(s, { type: e.type, data: e.data } as InstructorQualificationEvent),
    initialState(),
  )

  const firstData = setEvents[0].data as { setBy: string; changedAt: string }
  const lastEvent = setEvents[setEvents.length - 1]
  const lastData = lastEvent.data as { setBy: string; changedAt: string }

  return {
    id: Number(lastEvent.metadata.streamPosition),
    memberId,
    fiExpiry: state.fiExpiry,
    iriExpiry: state.iriExpiry,
    criExpiry: state.criExpiry,
    sepExpiry: state.sepExpiry,
    medicalClass1Expiry: state.medicalClass1Expiry,
    medicalClass2Expiry: state.medicalClass2Expiry,
    medicalLaplExpiry: state.medicalLaplExpiry,
    createdAt: firstData.changedAt,
    createdBy: firstData.setBy,
    updatedAt: lastData.changedAt,
    updatedBy: lastData.setBy,
  }
}

/**
 * Append an InstructorQualificationSet event, update the read-model table, and
 * return the qualification plus the stream position used as historyId.
 */
export async function upsertInstructorQualification(
  memberId: string,
  data: InstructorQualificationUpsert,
  jwt: JWTUser,
): Promise<{ qualification: InstructorQualification; historyId: number }> {
  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const event = setQualifications(memberId, data, jwt.memberId)

  const { nextExpectedStreamVersion } =
    await eventStore.appendToStream<InstructorQualificationEvent>(streamId, [event])

  const historyId = Number(nextExpectedStreamVersion)
  const qualification = (await getInstructorQualification(memberId))!
  return { qualification, historyId }
}

/**
 * Append a QualificationProofUploaded event to record that a proof file was
 * linked to this instructor's event stream.
 */
export async function appendProofUploadedEvent(
  memberId: string,
  proofFileId: number,
  fileName: string,
  documentCategory: ProofDocumentCategory,
  uploadedBy: string,
): Promise<void> {
  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const event = recordProofUploaded(memberId, proofFileId, fileName, documentCategory, uploadedBy)
  await eventStore.appendToStream<InstructorQualificationEvent>(streamId, [event])
}

export async function getInstructorQualificationHistory(
  memberId: string,
): Promise<InstructorQualificationHistory[]> {
  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const { events } = await eventStore.readStream<InstructorQualificationEvent>(streamId)

  return events
    .filter(e => e.type === 'InstructorQualificationSet')
    .reverse()
    .map(e => {
      const d = e.data as {
        memberId: string
        fiExpiry: string | null
        iriExpiry: string | null
        criExpiry: string | null
        sepExpiry: string | null
        medicalClass1Expiry: string | null
        medicalClass2Expiry: string | null
        medicalLaplExpiry: string | null
        setBy: string
        changedAt: string
      }
      return {
        historyId: Number(e.metadata.streamPosition),
        qualificationId: 0,
        memberId,
        fiExpiry: d.fiExpiry,
        iriExpiry: d.iriExpiry,
        criExpiry: d.criExpiry,
        sepExpiry: d.sepExpiry,
        medicalClass1Expiry: d.medicalClass1Expiry,
        medicalClass2Expiry: d.medicalClass2Expiry,
        medicalLaplExpiry: d.medicalLaplExpiry,
        changedAt: d.changedAt,
        changedBy: d.setBy,
        operationType: e.metadata.streamPosition === 1n ? 'INSERT' : 'UPDATE',
      }
    })
}

/**
 * Return the qualification state as it was at the end of a given date by
 * replaying the event stream up to end-of-day.
 */
export async function getQualificationSnapshotAtDate(
  memberId: string,
  asOf: Date,
): Promise<QualificationSnapshot> {
  const endOfDay = new Date(asOf)
  endOfDay.setHours(23, 59, 59, 999)

  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const { events } = await eventStore.readStream<InstructorQualificationEvent>(streamId)

  const setEvents = events
    .filter(e => e.type === 'InstructorQualificationSet')
    .filter(e => new Date((e.data as { changedAt: string }).changedAt) <= endOfDay)
  const state = setEvents.reduce(
    (s, e) => evolve(s, { type: e.type, data: e.data } as InstructorQualificationEvent),
    initialState(),
  )

  const lastSetEvent = setEvents[setEvents.length - 1]

  const [licenseProofFile, medicalProofFile] = await Promise.all([
    getLatestProofByCategory(memberId, 'LICENSE', endOfDay),
    getLatestProofByCategory(memberId, 'MEDICAL', endOfDay),
  ])

  return {
    asOf: asOf.toISOString(),
    memberId,
    fiExpiry: state.fiExpiry,
    iriExpiry: state.iriExpiry,
    criExpiry: state.criExpiry,
    sepExpiry: state.sepExpiry,
    medicalClass1Expiry: state.medicalClass1Expiry,
    medicalClass2Expiry: state.medicalClass2Expiry,
    medicalLaplExpiry: state.medicalLaplExpiry,
    changedAt: lastSetEvent ? (lastSetEvent.data as { changedAt: string }).changedAt : null,
    changedBy: lastSetEvent ? (lastSetEvent.data as { setBy: string }).setBy : null,
    licenseProofFile,
    medicalProofFile,
  }
}

export async function getAllInstructorStatuses(): Promise<InstructorStatusSummary[]> {
  const members = await db
    .selectFrom('member.register')
    .innerJoin(
      'member.member_to_roles',
      'member.register.member_id',
      'member.member_to_roles.member_id',
    )
    .select([
      'member.register.member_id',
      'member.register.first_name',
      'member.register.last_name',
    ])
    .where('member.member_to_roles.role_id', 'in', INSTRUCTOR_ROLES)
    .where('member.register.member_type', '!=', 'REMOVED')
    .groupBy([
      'member.register.member_id',
      'member.register.first_name',
      'member.register.last_name',
    ])
    .orderBy('member.register.last_name')
    .orderBy('member.register.first_name')
    .execute()

  const memberIds = members.map(m => m.member_id)
  const proofIds = await getLatestProofIdsByMembers(memberIds)
  const eventStore = getEventStore()

  return Promise.all(
    members.map(async member => {
      const streamId = instructorQualificationStreamId(member.member_id)
      const { state } = await eventStore.aggregateStream<
        ReturnType<typeof initialState>,
        InstructorQualificationEvent
      >(streamId, { evolve, initialState })
      return {
        memberId: member.member_id,
        firstName: member.first_name,
        lastName: member.last_name,
        fiExpiry: state.fiExpiry,
        iriExpiry: state.iriExpiry,
        criExpiry: state.criExpiry,
        sepExpiry: state.sepExpiry,
        medicalClass1Expiry: state.medicalClass1Expiry,
        medicalClass2Expiry: state.medicalClass2Expiry,
        medicalLaplExpiry: state.medicalLaplExpiry,
        licenseProofId: proofIds.get(member.member_id)?.licenseProofId ?? null,
        medicalProofId: proofIds.get(member.member_id)?.medicalProofId ?? null,
      }
    }),
  )
}

/**
 * Reconstruct the qualification state of all instructors as of a given date.
 * Uses the history table to find each member's most recent record at or before end-of-day.
 * Members who had no record by that date are still returned (with null expiry fields)
 * so auditors see the full roster.
 */
export async function getAllInstructorStatusesAtDate(
  asOf: Date,
): Promise<InstructorStatusSummary[]> {
  const endOfDay = new Date(asOf)
  endOfDay.setHours(23, 59, 59, 999)

  // Get the current roster (names never change retroactively)
  const members = await db
    .selectFrom('member.register')
    .innerJoin(
      'member.member_to_roles',
      'member.register.member_id',
      'member.member_to_roles.member_id',
    )
    .select([
      'member.register.member_id',
      'member.register.first_name',
      'member.register.last_name',
    ])
    .where('member.member_to_roles.role_id', 'in', INSTRUCTOR_ROLES)
    .where('member.register.member_type', '!=', 'REMOVED')
    .groupBy([
      'member.register.member_id',
      'member.register.first_name',
      'member.register.last_name',
    ])
    .orderBy('member.register.last_name')
    .orderBy('member.register.first_name')
    .execute()

  const memberIds = members.map(m => m.member_id)
  const proofIds = await getLatestProofIdsByMembers(memberIds, endOfDay)
  const eventStore = getEventStore()

  const results: InstructorStatusSummary[] = await Promise.all(
    members.map(async member => {
      const streamId = instructorQualificationStreamId(member.member_id)
      const { events } = await eventStore.readStream<InstructorQualificationEvent>(streamId)
      const eventsUpToDate = events
        .filter(e => e.type === 'InstructorQualificationSet')
        .filter(e => new Date((e.data as { changedAt: string }).changedAt) <= endOfDay)
      const state = eventsUpToDate.reduce(
        (s, e) => evolve(s, { type: e.type, data: e.data } as InstructorQualificationEvent),
        initialState(),
      )
      return {
        memberId: member.member_id,
        firstName: member.first_name,
        lastName: member.last_name,
        fiExpiry: state.fiExpiry,
        iriExpiry: state.iriExpiry,
        criExpiry: state.criExpiry,
        sepExpiry: state.sepExpiry,
        medicalClass1Expiry: state.medicalClass1Expiry,
        medicalClass2Expiry: state.medicalClass2Expiry,
        medicalLaplExpiry: state.medicalLaplExpiry,
        licenseProofId: proofIds.get(member.member_id)?.licenseProofId ?? null,
        medicalProofId: proofIds.get(member.member_id)?.medicalProofId ?? null,
      }
    }),
  )

  return results
}

export type QualificationField =
  | 'fiExpiry'
  | 'iriExpiry'
  | 'criExpiry'
  | 'sepExpiry'
  | 'medicalClass1Expiry'
  | 'medicalClass2Expiry'
  | 'medicalLaplExpiry'

export interface ExpiringQualification {
  memberId: string
  firstName: string
  lastName: string
  email: string
  lang: string | undefined
  field: QualificationField
  expiryDate: string
}

/**
 * Return all qualification fields for all instructors whose expiry falls exactly
 * on `expiryDate` (string 'YYYY-MM-DD'). Used by the expiry worker.
 */
export async function getQualificationsByExpiryDate(
  expiryDate: string,
): Promise<ExpiringQualification[]> {
  const members = await db
    .selectFrom('member.register as r')
    .innerJoin('member.member_to_roles as mtr', 'r.member_id', 'mtr.member_id')
    .select(['r.member_id', 'r.first_name', 'r.last_name', 'r.email', 'r.lang_iso639'])
    .where('mtr.role_id', 'in', INSTRUCTOR_ROLES)
    .where('r.member_type', '!=', 'REMOVED')
    .groupBy(['r.member_id', 'r.first_name', 'r.last_name', 'r.email', 'r.lang_iso639'])
    .execute()

  const eventStore = getEventStore()
  const results: ExpiringQualification[] = []

  await Promise.all(
    members.map(async member => {
      const { state } = await eventStore.aggregateStream<
        ReturnType<typeof initialState>,
        InstructorQualificationEvent
      >(instructorQualificationStreamId(member.member_id), { evolve, initialState })

      const fields: Array<[QualificationField, string | null]> = [
        ['fiExpiry', state.fiExpiry],
        ['iriExpiry', state.iriExpiry],
        ['criExpiry', state.criExpiry],
        ['sepExpiry', state.sepExpiry],
        ['medicalClass1Expiry', state.medicalClass1Expiry],
        ['medicalClass2Expiry', state.medicalClass2Expiry],
        ['medicalLaplExpiry', state.medicalLaplExpiry],
      ]

      for (const [field, expiry] of fields) {
        if (expiry === expiryDate) {
          results.push({
            memberId: member.member_id,
            firstName: member.first_name,
            lastName: member.last_name,
            email: member.email,
            lang: member.lang_iso639 ?? undefined,
            field,
            expiryDate,
          })
        }
      }
    }),
  )

  return results
}

/**
 * Check the event stream to see if a notification of the given type has already
 * been recorded for this member + field + expiryDate combination.
 */
export async function hasExpiryNotificationBeenSent(
  memberId: string,
  field: string,
  notificationType: 'REMINDER' | 'EXPIRED',
  expiryDate: string,
): Promise<boolean> {
  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const { state } = await eventStore.aggregateStream<
    ReturnType<typeof initialState>,
    InstructorQualificationEvent
  >(streamId, { evolve, initialState })
  const key = `${field}:${notificationType}:${expiryDate}`
  return state.sentNotifications.includes(key)
}

/**
 * Append a QualificationExpiryNotificationSent event. Idempotent — if the
 * notification key is already in the stream state it is not appended again.
 */
export async function recordExpiryNotificationSent(
  memberId: string,
  field: string,
  notificationType: 'REMINDER' | 'EXPIRED',
  expiryDate: string,
): Promise<void> {
  const eventStore = getEventStore()
  const streamId = instructorQualificationStreamId(memberId)
  const { state } = await eventStore.aggregateStream<
    ReturnType<typeof initialState>,
    InstructorQualificationEvent
  >(streamId, { evolve, initialState })
  const event = recordNotificationSent(memberId, field, notificationType, expiryDate, state)
  if (!event) return
  await eventStore.appendToStream<InstructorQualificationEvent>(streamId, [event])
}
