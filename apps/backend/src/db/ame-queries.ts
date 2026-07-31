import { sql, type SqlBool } from 'kysely'
import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  AmeStatus,
  type AmeEntry,
  type AmeListFilters,
  type AmeListResponse,
  type CreateAmeEntry,
} from '../routes/ame/models.ts'

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
})

const baseSelect = () =>
  db
    .selectFrom('club.ame_list as a')
    .leftJoin('member.register as m', 'm.member_id', 'a.submitted_by')
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
    ])

export async function getApprovedAmeEntries(filters: AmeListFilters): Promise<AmeListResponse> {
  const { medicalType, sort, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  let q = baseSelect().where('a.status', '=', AmeStatus.APPROVED)

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

export async function getAllAmeEntries(filters: AmeListFilters): Promise<AmeListResponse> {
  const { status, medicalType, sort, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  let q = baseSelect()

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
