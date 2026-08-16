import { sql, type SqlBool } from 'kysely'

import { camelDb, type CamelRow } from './connection.ts'
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

// `submittedByName` is a raw `trim(concat(...))` over the joined member row; the three
// rating columns come from the aggregate subquery and the current user's rating join.
// Everything else is `club.ameList` itself, so it is checked against the schema.
type AmeRow = CamelRow<'club.ameList'> & {
  submittedByName: string | null
  averageRating: unknown
  ratingCount: unknown
  myRating: unknown
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
  submittedBy: row.submittedBy,
  submittedByName: row.submittedByName,
  name: row.name,
  medicalCentre: row.medicalCentre,
  location: row.location,
  price: toNullableNumber(row.price),
  medicalTypes: row.medicalTypes,
  notes: row.notes,
  reportDate: String(row.reportDate),
  status: row.status as AmeStatus,
  approvedAt: toNullableIsoString(row.approvedAt),
  approvedBy: row.approvedBy,
  rejectedAt: toNullableIsoString(row.rejectedAt),
  rejectedBy: row.rejectedBy,
  rejectionReason: row.rejectionReason,
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
  averageRating: row.averageRating == null ? null : Number(row.averageRating),
  ratingCount: Number(row.ratingCount ?? 0),
  myRating: row.myRating == null ? null : Number(row.myRating),
})

/**
 * Maps a row written by an insert/update, which comes back from `returningAll()` with
 * none of the columns `baseSelect` joins on — no submitter name, no ratings. Explicit
 * empty values rather than a cast, so the absence is stated once instead of at each of
 * the three call sites.
 */
const mapRowWithoutJoins = (row: CamelRow<'club.ameList'>): AmeEntry =>
  mapRow({ ...row, submittedByName: null, averageRating: null, ratingCount: 0, myRating: null })

const baseSelect = (currentUserId?: string) =>
  camelDb
    .selectFrom('club.ameList as a')
    .leftJoin('member.register as m', 'm.memberId', 'a.submittedBy')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('club.ameRating')
          .select([
            'ameId',
            (eb) => eb.fn.avg('stars').as('averageRating'),
            (eb) => eb.fn.count('id').as('ratingCount'),
          ])
          .groupBy('ameId')
          .as('r'),
      (join) => join.onRef('r.ameId', '=', 'a.id'),
    )
    .leftJoin('club.ameRating as myR', (join) =>
      join.onRef('myR.ameId', '=', 'a.id').on('myR.memberId', '=', currentUserId ?? null),
    )
    .select([
      'a.id',
      'a.submittedBy',
      sql<string>`trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, '')))`.as(
        'submittedByName',
      ),
      'a.name',
      'a.medicalCentre',
      'a.location',
      'a.price',
      'a.medicalTypes',
      'a.notes',
      'a.reportDate',
      'a.status',
      'a.approvedAt',
      'a.approvedBy',
      'a.rejectedAt',
      'a.rejectedBy',
      'a.rejectionReason',
      'a.createdAt',
      'a.updatedAt',
      'r.averageRating',
      'r.ratingCount',
      'myR.stars as myRating',
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

  const countQ = camelDb
    .selectFrom('club.ameList as a')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('a.status', '=', AmeStatus.APPROVED)

  const countResult = await countQ.executeTakeFirstOrThrow()
  const total = Number(countResult.count)

  if (sort === 'price_asc') {
    q = q.orderBy(sql`a.price asc nulls last`)
  } else {
    q = q.orderBy('a.reportDate desc')
  }

  const rows = await q.limit(pageSize).offset(offset).execute()

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

  const countQ = camelDb
    .selectFrom('club.ameList as a')
    .select((eb) => eb.fn.countAll<number>().as('count'))

  const countResult = await (
    status ? countQ.where('a.status', '=', status) : countQ
  ).executeTakeFirstOrThrow()

  const total = Number(countResult.count)

  if (sort === 'price_asc') {
    q = q.orderBy(sql`a.price asc nulls last`)
  } else {
    q = q.orderBy('a.createdAt desc')
  }

  const rows = await q.limit(pageSize).offset(offset).execute()

  return { entries: rows.map(mapRow), total, page, pageSize }
}

export async function getPendingAmeCount(): Promise<number> {
  const result = await camelDb
    .selectFrom('club.ameList')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('status', '=', AmeStatus.SUBMITTED)
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

export async function createAmeEntry(data: CreateAmeEntry, user: JWTUser): Promise<AmeEntry> {
  const row = await camelDb
    .insertInto('club.ameList')
    .values({
      submittedBy: user.memberId,
      name: data.name,
      medicalCentre: data.medicalCentre,
      location: data.location,
      price: data.price ?? null,
      medicalTypes: data.medicalTypes,
      notes: data.notes ?? null,
      reportDate: data.reportDate,
      status: AmeStatus.SUBMITTED,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowWithoutJoins(row)
}

export async function approveAmeEntry(id: string, approver: JWTUser): Promise<AmeEntry | null> {
  const row = await camelDb
    .updateTable('club.ameList')
    .set({
      status: AmeStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy: approver.memberId,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .where('status', '=', AmeStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null
  return mapRowWithoutJoins(row)
}

export async function rejectAmeEntry(
  id: string,
  rejecter: JWTUser,
  reason: string,
): Promise<AmeEntry | null> {
  const row = await camelDb
    .updateTable('club.ameList')
    .set({
      status: AmeStatus.REJECTED,
      rejectedAt: new Date(),
      rejectedBy: rejecter.memberId,
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .where('status', '=', AmeStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null
  return mapRowWithoutJoins(row)
}

export async function upsertAmeRating(
  ameId: string,
  memberId: string,
  stars: number,
): Promise<void> {
  await camelDb
    .insertInto('club.ameRating')
    .values({ ameId: ameId, memberId: memberId, stars })
    .onConflict((oc) =>
      oc.columns(['ameId', 'memberId']).doUpdateSet({ stars, updatedAt: new Date() }),
    )
    .execute()
}

export async function getPendingReviewCounts(): Promise<AmePendingCounts> {
  const [submissions, editSuggestions, removalRequests] = await Promise.all([
    camelDb
      .selectFrom('club.ameList')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('status', '=', AmeStatus.SUBMITTED)
      .executeTakeFirstOrThrow(),
    camelDb
      .selectFrom('club.ameEditSuggestion')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('status', '=', AmeReviewStatus.SUBMITTED)
      .executeTakeFirstOrThrow(),
    camelDb
      .selectFrom('club.ameRemovalRequest')
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

/** The `club.ameList` columns `editSuggestionBaseSelect` aliases as `current*`. */
type CurrentAmeColumns = Pick<
  CamelRow<'club.ameList'>,
  'name' | 'medicalCentre' | 'location' | 'price' | 'medicalTypes' | 'notes' | 'reportDate'
>

// The suggestion's own columns are `club.ameEditSuggestion`; `submittedByName` is a raw
// `trim(concat(...))` over the joined member row, and the `current*` columns are the
// live `club.ameList` values the suggestion would replace.
type AmeEditSuggestionRow = CamelRow<'club.ameEditSuggestion'> & {
  submittedByName: string | null
  currentName: CurrentAmeColumns['name']
  currentMedicalCentre: CurrentAmeColumns['medicalCentre']
  currentLocation: CurrentAmeColumns['location']
  currentPrice: CurrentAmeColumns['price']
  currentMedicalTypes: CurrentAmeColumns['medicalTypes']
  currentNotes: CurrentAmeColumns['notes']
  currentReportDate: CurrentAmeColumns['reportDate']
}

const mapEditSuggestionRow = (row: AmeEditSuggestionRow): AmeEditSuggestion => ({
  id: row.id,
  ameId: row.ameId,
  submittedBy: row.submittedBy,
  submittedByName: row.submittedByName,
  name: row.name,
  medicalCentre: row.medicalCentre,
  location: row.location,
  price: toNullableNumber(row.price),
  medicalTypes: row.medicalTypes,
  notes: row.notes,
  reportDate: String(row.reportDate),
  status: row.status as AmeReviewStatus,
  reviewedAt: toNullableIsoString(row.reviewedAt),
  reviewedBy: row.reviewedBy,
  rejectionReason: row.rejectionReason,
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
  currentName: row.currentName,
  currentMedicalCentre: row.currentMedicalCentre,
  currentLocation: row.currentLocation,
  currentPrice: toNullableNumber(row.currentPrice),
  currentMedicalTypes: row.currentMedicalTypes,
  currentNotes: row.currentNotes,
  currentReportDate: String(row.currentReportDate),
})

const editSuggestionBaseSelect = () =>
  camelDb
    .selectFrom('club.ameEditSuggestion as s')
    .innerJoin('club.ameList as a', 'a.id', 's.ameId')
    .leftJoin('member.register as m', 'm.memberId', 's.submittedBy')
    .select([
      's.id',
      's.ameId',
      's.submittedBy',
      sql<string>`trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, '')))`.as(
        'submittedByName',
      ),
      's.name',
      's.medicalCentre',
      's.location',
      's.price',
      's.medicalTypes',
      's.notes',
      's.reportDate',
      's.status',
      's.reviewedAt',
      's.reviewedBy',
      's.rejectionReason',
      's.createdAt',
      's.updatedAt',
      'a.name as currentName',
      'a.medicalCentre as currentMedicalCentre',
      'a.location as currentLocation',
      'a.price as currentPrice',
      'a.medicalTypes as currentMedicalTypes',
      'a.notes as currentNotes',
      'a.reportDate as currentReportDate',
    ])

export async function createAmeEditSuggestion(
  ameId: string,
  data: SuggestAmeEdit,
  user: JWTUser,
): Promise<AmeEditSuggestion> {
  const row = await camelDb
    .insertInto('club.ameEditSuggestion')
    .values({
      ameId: ameId,
      submittedBy: user.memberId,
      name: data.name,
      medicalCentre: data.medicalCentre,
      location: data.location,
      price: data.price ?? null,
      medicalTypes: data.medicalTypes,
      notes: data.notes ?? null,
      reportDate: data.reportDate,
      status: AmeReviewStatus.SUBMITTED,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const [current] = await editSuggestionBaseSelect().where('s.id', '=', row.id).execute()

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

  const countQ = camelDb
    .selectFrom('club.ameEditSuggestion')
    .select((eb) => eb.fn.countAll<number>().as('count'))

  const countResult = await (
    status ? countQ.where('status', '=', status) : countQ
  ).executeTakeFirstOrThrow()

  const rows = await q.orderBy('s.createdAt desc').limit(pageSize).offset(offset).execute()

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
  const suggestion = await camelDb
    .selectFrom('club.ameEditSuggestion')
    .selectAll()
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .executeTakeFirst()

  if (!suggestion) return null

  await camelDb
    .updateTable('club.ameList')
    .set({
      name: suggestion.name,
      medicalCentre: suggestion.medicalCentre,
      location: suggestion.location,
      price: suggestion.price,
      medicalTypes: suggestion.medicalTypes,
      notes: suggestion.notes,
      reportDate: suggestion.reportDate,
      updatedAt: new Date(),
    })
    .where('id', '=', suggestion.ameId)
    .execute()

  await camelDb
    .updateTable('club.ameEditSuggestion')
    .set({
      status: AmeReviewStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedBy: approver.memberId,
    })
    .where('id', '=', id)
    .execute()

  const [current] = await editSuggestionBaseSelect().where('s.id', '=', id).execute()

  return mapEditSuggestionRow(current)
}

export async function rejectAmeEditSuggestion(
  id: string,
  rejecter: JWTUser,
  reason: string,
): Promise<AmeEditSuggestion | null> {
  const row = await camelDb
    .updateTable('club.ameEditSuggestion')
    .set({
      status: AmeReviewStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedBy: rejecter.memberId,
      rejectionReason: reason,
    })
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null

  const [current] = await editSuggestionBaseSelect().where('s.id', '=', id).execute()

  return mapEditSuggestionRow(current)
}

// `ameName` is the joined `club.ameList.name`, `submittedByName` a raw `trim(concat(...))`
// over the joined member row; the rest is `club.ameRemovalRequest` itself.
type AmeRemovalRequestRow = CamelRow<'club.ameRemovalRequest'> & {
  ameName: CamelRow<'club.ameList'>['name']
  submittedByName: string | null
}

const mapRemovalRequestRow = (row: AmeRemovalRequestRow): AmeRemovalRequest => ({
  id: row.id,
  ameId: row.ameId,
  ameName: row.ameName,
  submittedBy: row.submittedBy,
  submittedByName: row.submittedByName,
  reason: row.reason,
  status: row.status as AmeReviewStatus,
  reviewedAt: toNullableIsoString(row.reviewedAt),
  reviewedBy: row.reviewedBy,
  rejectionReason: row.rejectionReason,
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
})

const removalRequestBaseSelect = () =>
  camelDb
    .selectFrom('club.ameRemovalRequest as r')
    .innerJoin('club.ameList as a', 'a.id', 'r.ameId')
    .leftJoin('member.register as m', 'm.memberId', 'r.submittedBy')
    .select([
      'r.id',
      'r.ameId',
      'a.name as ameName',
      'r.submittedBy',
      sql<string>`trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, '')))`.as(
        'submittedByName',
      ),
      'r.reason',
      'r.status',
      'r.reviewedAt',
      'r.reviewedBy',
      'r.rejectionReason',
      'r.createdAt',
      'r.updatedAt',
    ])

export async function createAmeRemovalRequest(
  ameId: string,
  data: RequestAmeRemoval,
  user: JWTUser,
): Promise<AmeRemovalRequest> {
  const row = await camelDb
    .insertInto('club.ameRemovalRequest')
    .values({
      ameId: ameId,
      submittedBy: user.memberId,
      reason: data.reason,
      status: AmeReviewStatus.SUBMITTED,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const [current] = await removalRequestBaseSelect().where('r.id', '=', row.id).execute()

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

  const countQ = camelDb
    .selectFrom('club.ameRemovalRequest')
    .select((eb) => eb.fn.countAll<number>().as('count'))

  const countResult = await (
    status ? countQ.where('status', '=', status) : countQ
  ).executeTakeFirstOrThrow()

  const rows = await q.orderBy('r.createdAt desc').limit(pageSize).offset(offset).execute()

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
  const request = await camelDb
    .selectFrom('club.ameRemovalRequest')
    .selectAll()
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .executeTakeFirst()

  if (!request) return null

  await camelDb
    .updateTable('club.ameList')
    .set({ status: AmeStatus.REMOVED, updatedAt: new Date() })
    .where('id', '=', request.ameId)
    .execute()

  await camelDb
    .updateTable('club.ameRemovalRequest')
    .set({
      status: AmeReviewStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedBy: approver.memberId,
    })
    .where('id', '=', id)
    .execute()

  const [current] = await removalRequestBaseSelect().where('r.id', '=', id).execute()

  return mapRemovalRequestRow(current)
}

export async function rejectAmeRemovalRequest(
  id: string,
  rejecter: JWTUser,
  reason: string,
): Promise<AmeRemovalRequest | null> {
  const row = await camelDb
    .updateTable('club.ameRemovalRequest')
    .set({
      status: AmeReviewStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedBy: rejecter.memberId,
      rejectionReason: reason,
    })
    .where('id', '=', id)
    .where('status', '=', AmeReviewStatus.SUBMITTED)
    .returningAll()
    .executeTakeFirst()

  if (!row) return null

  const [current] = await removalRequestBaseSelect().where('r.id', '=', id).execute()

  return mapRemovalRequestRow(current)
}
