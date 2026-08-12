import { sql, type SqlBool } from 'kysely'

import { db } from './connection.ts'
import {
  AmeReviewStatus,
  AmeStatus,
  type AmeEditSuggestion,
  type AmeEditSuggestionListResponse,
  type AmeEntry,
  type AmeListFilters,
  type AmeListResponse,
  type AmePendingCounts,
  type AmeRemovalRequest,
  type AmeRemovalRequestListResponse,
  type AmeReviewFilters,
  type CreateAmeEntry,
  type RequestAmeRemoval,
  type SuggestAmeEdit,
} from '@mik/contracts/ame'
import type { JWTUser } from '../routes/auth/token.ts'

type AmeRow = {
  id: string
  submitted_by: string
  submitted_by_name: string | null
  name: string
  medical_centre: string
  location: string
  price: unknown
  medical_types: string[]
  notes: string | null
  report_date: unknown
  status: string
  approved_at: unknown
  approved_by: string | null
  rejected_at: unknown
  rejected_by: string | null
  rejection_reason: string | null
  created_at: unknown
  updated_at: unknown
  average_rating: unknown
  rating_count: unknown
  my_rating: unknown
}

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString()
  return new Date(String(value)).toISOString()
}

const toNullableIsoString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  return toIsoString(value)
}

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  return Number(value)
}

const mapRow = (row: AmeRow): AmeEntry => ({
  id: row.id,
  submittedBy: row.submitted_by,
  submittedByName: row.submitted_by_name,
  name: row.name,
  medicalCentre: row.medical_centre,
  location: row.location,
  price: toNullableNumber(row.price),
  medicalTypes: row.medical_types,
  notes: row.notes,
  reportDate: String(row.report_date),
  status: row.status as AmeStatus,
  approvedAt: toNullableIsoString(row.approved_at),
  approvedBy: row.approved_by,
  rejectedAt: toNullableIsoString(row.rejected_at),
  rejectedBy: row.rejected_by,
  rejectionReason: row.rejection_reason,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  averageRating: row.average_rating == null ? null : Number(row.average_rating),
  ratingCount: Number(row.rating_count ?? 0),
  myRating: row.my_rating == null ? null : Number(row.my_rating),
})

const baseSelect = (currentUserId?: string) =>
  db
    .selectFrom('club.ame_list as a')
    .leftJoin('member.register as m', 'm.member_id', 'a.submitted_by')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('club.ame_rating')
          .select([
            'ame_id',
            (eb) => eb.fn.avg('stars').as('average_rating'),
            (eb) => eb.fn.count('id').as('rating_count'),
          ])
          .groupBy('ame_id')
          .as('r'),
      (join) => join.onRef('r.ame_id', '=', 'a.id'),
    )
    .leftJoin('club.ame_rating as my_r', (join) =>
      join.onRef('my_r.ame_id', '=', 'a.id').on('my_r.member_id', '=', currentUserId ?? null),
    )
    .select([
      'a.id',
      'a.submitted_by',
      sql<string>`trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, '')))`.as(
        'submitted_by_name',
      ),
      'a.name',
      'a.medical_centre',
      'a.location',
      'a.price',
      'a.medical_types',
      'a.notes',
      'a.report_date',
      'a.status',
      'a.approved_at',
      'a.approved_by',
      'a.rejected_at',
      'a.rejected_by',
      'a.rejection_reason',
      'a.created_at',
      'a.updated_at',
      'r.average_rating',
      'r.rating_count',
      'my_r.stars as my_rating',
    ])

export async function getApprovedAmeEntries(
  filters: AmeListFilters,
  currentUserId?: string,
): Promise<AmeListResponse> {
  const { medicalType, sort, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  let q = baseSelect(currentUserId).where('a.status', '=', AmeStatus.APPROVED)

  if (medicalType) {
    q = q.where(sql<SqlBool>`a.medical_types @> ${sql.val([medicalType])}::text[]`)
  }

  const countQ = db
    .selectFrom('club.ame_list as a')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('a.status', '=', AmeStatus.APPROVED)

  const countResult = await countQ.executeTakeFirstOrThrow()
  const total = Number(countResult.count)

  if (sort === 'price_asc') {
    q = q.orderBy(sql`a.price asc nulls last`)
  } else {
    q = q.orderBy('a.report_date desc')
  }

  const rows = (await q.limit(pageSize).offset(offset).execute()) as unknown as AmeRow[]

  return { entries: rows.map(mapRow), total, page, pageSize }
}

export async function getAllAmeEntries(
  filters: AmeListFilters,
  currentUserId?: string,
): Promise<AmeListResponse> {
  const { status, medicalType, sort, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  let q = baseSelect(currentUserId)

  if (status) {
    q = q.where('a.status', '=', status)
  }

  if (medicalType) {
    q = q.where(sql<SqlBool>`a.medical_types @> ${sql.val([medicalType])}::text[]`)
  }

  const countQ = db
    .selectFrom('club.ame_list as a')
    .select((eb) => eb.fn.countAll<number>().as('count'))

  const countResult = await (
    status ? countQ.where('a.status', '=', status) : countQ
  ).executeTakeFirstOrThrow()

  const total = Number(countResult.count)

  if (sort === 'price_asc') {
    q = q.orderBy(sql`a.price asc nulls last`)
  } else {
    q = q.orderBy('a.created_at desc')
  }

  const rows = (await q.limit(pageSize).offset(offset).execute()) as unknown as AmeRow[]

  return { entries: rows.map(mapRow), total, page, pageSize }
}

export async function getPendingAmeCount(): Promise<number> {
  const result = await db
    .selectFrom('club.ame_list')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('status', '=', AmeStatus.SUBMITTED)
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

export async function createAmeEntry(data: CreateAmeEntry, user: JWTUser): Promise<AmeEntry> {
  const row = await db
    .insertInto('club.ame_list')
    .values({
      submitted_by: user.memberId,
      name: data.name,
      medical_centre: data.medicalCentre,
      location: data.location,
      price: data.price ?? null,
      medical_types: data.medicalTypes,
      notes: data.notes ?? null,
      report_date: data.reportDate,
      status: AmeStatus.SUBMITTED,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRow({ ...row, submitted_by_name: null } as unknown as AmeRow)
}

export async function approveAmeEntry(id: string, approver: JWTUser): Promise<AmeEntry | null> {
  const row = await db
    .updateTable('club.ame_list')
    .set({
      status: AmeStatus.APPROVED,
      approved_at: new Date(),
      approved_by: approver.memberId,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .where('status', '=', AmeStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null
  return mapRow({ ...row, submitted_by_name: null } as unknown as AmeRow)
}

export async function rejectAmeEntry(
  id: string,
  rejecter: JWTUser,
  reason: string,
): Promise<AmeEntry | null> {
  const row = await db
    .updateTable('club.ame_list')
    .set({
      status: AmeStatus.REJECTED,
      rejected_at: new Date(),
      rejected_by: rejecter.memberId,
      rejection_reason: reason,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .where('status', '=', AmeStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null
  return mapRow({ ...row, submitted_by_name: null } as unknown as AmeRow)
}

export async function upsertAmeRating(
  ameId: string,
  memberId: string,
  stars: number,
): Promise<void> {
  await db
    .insertInto('club.ame_rating')
    .values({ ame_id: ameId, member_id: memberId, stars })
    .onConflict((oc) =>
      oc.columns(['ame_id', 'member_id']).doUpdateSet({ stars, updated_at: new Date() }),
    )
    .execute()
}

export async function getPendingReviewCounts(): Promise<AmePendingCounts> {
  const [submissions, editSuggestions, removalRequests] = await Promise.all([
    db
      .selectFrom('club.ame_list')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('status', '=', AmeStatus.SUBMITTED)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('club.ame_edit_suggestion')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('status', '=', AmeReviewStatus.SUBMITTED)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('club.ame_removal_request')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('status', '=', AmeReviewStatus.SUBMITTED)
      .executeTakeFirstOrThrow(),
  ])

  return {
    submissions: Number(submissions.count),
    editSuggestions: Number(editSuggestions.count),
    removalRequests: Number(removalRequests.count),
  }
}

type AmeEditSuggestionRow = {
  id: string
  ame_id: string
  submitted_by: string
  submitted_by_name: string | null
  name: string
  medical_centre: string
  location: string
  price: unknown
  medical_types: string[]
  notes: string | null
  report_date: unknown
  status: string
  reviewed_at: unknown
  reviewed_by: string | null
  rejection_reason: string | null
  created_at: unknown
  updated_at: unknown
  current_name: string
  current_medical_centre: string
  current_location: string
  current_price: unknown
  current_medical_types: string[]
  current_notes: string | null
  current_report_date: unknown
}

const mapEditSuggestionRow = (row: AmeEditSuggestionRow): AmeEditSuggestion => ({
  id: row.id,
  ameId: row.ame_id,
  submittedBy: row.submitted_by,
  submittedByName: row.submitted_by_name,
  name: row.name,
  medicalCentre: row.medical_centre,
  location: row.location,
  price: toNullableNumber(row.price),
  medicalTypes: row.medical_types,
  notes: row.notes,
  reportDate: String(row.report_date),
  status: row.status as AmeReviewStatus,
  reviewedAt: toNullableIsoString(row.reviewed_at),
  reviewedBy: row.reviewed_by,
  rejectionReason: row.rejection_reason,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  currentName: row.current_name,
  currentMedicalCentre: row.current_medical_centre,
  currentLocation: row.current_location,
  currentPrice: toNullableNumber(row.current_price),
  currentMedicalTypes: row.current_medical_types,
  currentNotes: row.current_notes,
  currentReportDate: String(row.current_report_date),
})

const editSuggestionBaseSelect = () =>
  db
    .selectFrom('club.ame_edit_suggestion as s')
    .innerJoin('club.ame_list as a', 'a.id', 's.ame_id')
    .leftJoin('member.register as m', 'm.member_id', 's.submitted_by')
    .select([
      's.id',
      's.ame_id',
      's.submitted_by',
      sql<string>`trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, '')))`.as(
        'submitted_by_name',
      ),
      's.name',
      's.medical_centre',
      's.location',
      's.price',
      's.medical_types',
      's.notes',
      's.report_date',
      's.status',
      's.reviewed_at',
      's.reviewed_by',
      's.rejection_reason',
      's.created_at',
      's.updated_at',
      'a.name as current_name',
      'a.medical_centre as current_medical_centre',
      'a.location as current_location',
      'a.price as current_price',
      'a.medical_types as current_medical_types',
      'a.notes as current_notes',
      'a.report_date as current_report_date',
    ])

export async function createAmeEditSuggestion(
  ameId: string,
  data: SuggestAmeEdit,
  user: JWTUser,
): Promise<AmeEditSuggestion> {
  const row = await db
    .insertInto('club.ame_edit_suggestion')
    .values({
      ame_id: ameId,
      submitted_by: user.memberId,
      name: data.name,
      medical_centre: data.medicalCentre,
      location: data.location,
      price: data.price ?? null,
      medical_types: data.medicalTypes,
      notes: data.notes ?? null,
      report_date: data.reportDate,
      status: AmeReviewStatus.SUBMITTED,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const [current] = (await editSuggestionBaseSelect()
    .where('s.id', '=', row.id)
    .execute()) as unknown as AmeEditSuggestionRow[]

  return mapEditSuggestionRow(current)
}

export async function getAllEditSuggestions(
  filters: AmeReviewFilters,
): Promise<AmeEditSuggestionListResponse> {
  const { status, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  let q = editSuggestionBaseSelect()
  if (status) {
    q = q.where('s.status', '=', status)
  }

  const countQ = db
    .selectFrom('club.ame_edit_suggestion')
    .select((eb) => eb.fn.countAll<number>().as('count'))

  const countResult = await (
    status ? countQ.where('status', '=', status) : countQ
  ).executeTakeFirstOrThrow()

  const rows = (await q
    .orderBy('s.created_at desc')
    .limit(pageSize)
    .offset(offset)
    .execute()) as unknown as AmeEditSuggestionRow[]

  return {
    entries: rows.map(mapEditSuggestionRow),
    total: Number(countResult.count),
    page,
    pageSize,
  }
}

export async function approveAmeEditSuggestion(
  id: string,
  approver: JWTUser,
): Promise<AmeEditSuggestion | null> {
  const suggestion = await db
    .selectFrom('club.ame_edit_suggestion')
    .selectAll()
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .executeTakeFirst()

  if (!suggestion) return null

  await db
    .updateTable('club.ame_list')
    .set({
      name: suggestion.name,
      medical_centre: suggestion.medical_centre,
      location: suggestion.location,
      price: suggestion.price,
      medical_types: suggestion.medical_types,
      notes: suggestion.notes,
      report_date: suggestion.report_date,
      updated_at: new Date(),
    })
    .where('id', '=', suggestion.ame_id)
    .execute()

  await db
    .updateTable('club.ame_edit_suggestion')
    .set({
      status: AmeReviewStatus.APPROVED,
      reviewed_at: new Date(),
      reviewed_by: approver.memberId,
    })
    .where('id', '=', id)
    .execute()

  const [current] = (await editSuggestionBaseSelect()
    .where('s.id', '=', id)
    .execute()) as unknown as AmeEditSuggestionRow[]

  return mapEditSuggestionRow(current)
}

export async function rejectAmeEditSuggestion(
  id: string,
  rejecter: JWTUser,
  reason: string,
): Promise<AmeEditSuggestion | null> {
  const row = await db
    .updateTable('club.ame_edit_suggestion')
    .set({
      status: AmeReviewStatus.REJECTED,
      reviewed_at: new Date(),
      reviewed_by: rejecter.memberId,
      rejection_reason: reason,
    })
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null

  const [current] = (await editSuggestionBaseSelect()
    .where('s.id', '=', id)
    .execute()) as unknown as AmeEditSuggestionRow[]

  return mapEditSuggestionRow(current)
}

type AmeRemovalRequestRow = {
  id: string
  ame_id: string
  ame_name: string
  submitted_by: string
  submitted_by_name: string | null
  reason: string
  status: string
  reviewed_at: unknown
  reviewed_by: string | null
  rejection_reason: string | null
  created_at: unknown
  updated_at: unknown
}

const mapRemovalRequestRow = (row: AmeRemovalRequestRow): AmeRemovalRequest => ({
  id: row.id,
  ameId: row.ame_id,
  ameName: row.ame_name,
  submittedBy: row.submitted_by,
  submittedByName: row.submitted_by_name,
  reason: row.reason,
  status: row.status as AmeReviewStatus,
  reviewedAt: toNullableIsoString(row.reviewed_at),
  reviewedBy: row.reviewed_by,
  rejectionReason: row.rejection_reason,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
})

const removalRequestBaseSelect = () =>
  db
    .selectFrom('club.ame_removal_request as r')
    .innerJoin('club.ame_list as a', 'a.id', 'r.ame_id')
    .leftJoin('member.register as m', 'm.member_id', 'r.submitted_by')
    .select([
      'r.id',
      'r.ame_id',
      'a.name as ame_name',
      'r.submitted_by',
      sql<string>`trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, '')))`.as(
        'submitted_by_name',
      ),
      'r.reason',
      'r.status',
      'r.reviewed_at',
      'r.reviewed_by',
      'r.rejection_reason',
      'r.created_at',
      'r.updated_at',
    ])

export async function createAmeRemovalRequest(
  ameId: string,
  data: RequestAmeRemoval,
  user: JWTUser,
): Promise<AmeRemovalRequest> {
  const row = await db
    .insertInto('club.ame_removal_request')
    .values({
      ame_id: ameId,
      submitted_by: user.memberId,
      reason: data.reason,
      status: AmeReviewStatus.SUBMITTED,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const [current] = (await removalRequestBaseSelect()
    .where('r.id', '=', row.id)
    .execute()) as unknown as AmeRemovalRequestRow[]

  return mapRemovalRequestRow(current)
}

export async function getAllRemovalRequests(
  filters: AmeReviewFilters,
): Promise<AmeRemovalRequestListResponse> {
  const { status, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  let q = removalRequestBaseSelect()
  if (status) {
    q = q.where('r.status', '=', status)
  }

  const countQ = db
    .selectFrom('club.ame_removal_request')
    .select((eb) => eb.fn.countAll<number>().as('count'))

  const countResult = await (
    status ? countQ.where('status', '=', status) : countQ
  ).executeTakeFirstOrThrow()

  const rows = (await q
    .orderBy('r.created_at desc')
    .limit(pageSize)
    .offset(offset)
    .execute()) as unknown as AmeRemovalRequestRow[]

  return {
    entries: rows.map(mapRemovalRequestRow),
    total: Number(countResult.count),
    page,
    pageSize,
  }
}

export async function approveAmeRemovalRequest(
  id: string,
  approver: JWTUser,
): Promise<AmeRemovalRequest | null> {
  const request = await db
    .selectFrom('club.ame_removal_request')
    .selectAll()
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .executeTakeFirst()

  if (!request) return null

  await db
    .updateTable('club.ame_list')
    .set({ status: AmeStatus.REMOVED, updated_at: new Date() })
    .where('id', '=', request.ame_id)
    .execute()

  await db
    .updateTable('club.ame_removal_request')
    .set({
      status: AmeReviewStatus.APPROVED,
      reviewed_at: new Date(),
      reviewed_by: approver.memberId,
    })
    .where('id', '=', id)
    .execute()

  const [current] = (await removalRequestBaseSelect()
    .where('r.id', '=', id)
    .execute()) as unknown as AmeRemovalRequestRow[]

  return mapRemovalRequestRow(current)
}

export async function rejectAmeRemovalRequest(
  id: string,
  rejecter: JWTUser,
  reason: string,
): Promise<AmeRemovalRequest | null> {
  const row = await db
    .updateTable('club.ame_removal_request')
    .set({
      status: AmeReviewStatus.REJECTED,
      reviewed_at: new Date(),
      reviewed_by: rejecter.memberId,
      rejection_reason: reason,
    })
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null

  const [current] = (await removalRequestBaseSelect()
    .where('r.id', '=', id)
    .execute()) as unknown as AmeRemovalRequestRow[]

  return mapRemovalRequestRow(current)
}
