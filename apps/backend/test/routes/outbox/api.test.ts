import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { randomUUID } from 'node:crypto'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/outbox/api.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import type { OutboxListResponse } from '@mik/contracts/outbox'
import { db } from '../../../src/db/connection.ts'

// ─── App Setup ──────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/outbox', router)
app.use(problemErrorHandler)

// ─── Tokens ─────────────────────────────────────────────────────────────────

const outboxAdminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.OUTBOX_ADMIN],
  canMakeReservations: false,
})

const noPermissionsToken = generateAccessToken({
  memberId: 'Anna1',
  lastName: 'Korhonen',
  email: 'anna@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** IDs owned by this test suite — cleaned up in afterEach */
const testIds: string[] = []

async function insertOutboxRow(overrides: {
  id?: string
  event_type?: string
  status?: string
  payload?: object
  error_message?: string | null
  created_at_utc?: Date
  processed_at?: Date | null
}) {
  const id = overrides.id ?? randomUUID()
  testIds.push(id)
  await db
    .insertInto('accts.outbox_simplbooks')
    .values({
      id,
      event_type: overrides.event_type ?? 'addMember',
      status: (overrides.status ?? 'PENDING') as any,
      payload: overrides.payload ?? ({ test: true } as any),
      created_at_utc: overrides.created_at_utc ?? new Date(),
      updated_at_utc: new Date(),
      processed_at: overrides.processed_at ?? null,
      error_message: overrides.error_message ?? null,
    })
    .execute()
  return id
}

async function getRowById(id: string) {
  return db
    .selectFrom('accts.outbox_simplbooks')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
}

afterEach(async () => {
  if (testIds.length > 0) {
    await db.deleteFrom('accts.outbox_simplbooks').where('id', 'in', testIds).execute()
    testIds.length = 0
  }
})

// ─── GET /outbox ─────────────────────────────────────────────────────────────

describe('GET /outbox', () => {
  it('should return 401 when no auth token is provided', async () => {
    const response = await request(app).get('/outbox')
    expect(response.status).toBe(401)
  })

  it('should return 403 for a user without OUTBOX_ADMIN permission', async () => {
    const response = await request(app)
      .get('/outbox')
      .set('Cookie', `accessToken=${noPermissionsToken}`)

    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/outbox',
      timestamp: expect.any(String),
    })
  })

  it('should return 200 with items array for an authorized user', async () => {
    await insertOutboxRow({ event_type: 'INVOICE_CREATED', status: 'PENDING' })

    const response = await request(app)
      .get('/outbox')
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('should return date fields as ISO strings', async () => {
    const processedAt = new Date('2024-06-15T12:00:00.000Z')
    const createdAt = new Date('2024-06-14T08:00:00.000Z')
    const id = await insertOutboxRow({
      status: 'SYNCED',
      created_at_utc: createdAt,
      processed_at: processedAt,
      payload: { memberId: 'abc123' },
    })

    const response = await request(app)
      .get('/outbox')
      .query({ created_from: '2024-06-01T00:00:00.000Z', created_to: '2024-06-30T00:00:00.000Z' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    const item = body.items.find((i) => i.id === id)
    expect(item).toBeDefined()
    expect(typeof item!.created_at_utc).toBe('string')
    expect(typeof item!.updated_at_utc).toBe('string')
    expect(typeof item!.processed_at).toBe('string')
    // Verify ISO 8601 format via round-trip
    expect(new Date(item!.created_at_utc).toISOString()).toBe(item!.created_at_utc)
    expect(new Date(item!.processed_at!).toISOString()).toBe(processedAt.toISOString())
  })

  it('should filter by status', async () => {
    const failedId = await insertOutboxRow({ status: 'FAILED', error_message: 'test error' })
    const pendingId = await insertOutboxRow({ status: 'PENDING' })

    const response = await request(app)
      .get('/outbox')
      .query({ status: 'FAILED' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    const ids = body.items.map((i) => i.id)
    expect(ids).toContain(failedId)
    expect(ids).not.toContain(pendingId)
  })

  it('should filter by event_type', async () => {
    const invoiceId = await insertOutboxRow({ event_type: 'INVOICE_CREATED' })
    const memberId = await insertOutboxRow({ event_type: 'MEMBER_CREATED' })

    const response = await request(app)
      .get('/outbox')
      .query({ event_type: 'INVOICE_CREATED' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    const ids = body.items.map((i) => i.id)
    expect(ids).toContain(invoiceId)
    expect(ids).not.toContain(memberId)
  })

  it('should filter by created_from date', async () => {
    const past = new Date('2020-01-01T00:00:00Z')
    const recent = new Date()

    const oldId = await insertOutboxRow({ created_at_utc: past })
    const newId = await insertOutboxRow({ created_at_utc: recent })

    const response = await request(app)
      .get('/outbox')
      .query({ created_from: '2021-01-01T00:00:00.000Z' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    const ids = body.items.map((i) => i.id)
    expect(ids).toContain(newId)
    expect(ids).not.toContain(oldId)
  })

  it('should filter by created_to date', async () => {
    const past = new Date('2020-06-01T00:00:00Z')
    const recent = new Date()

    const oldId = await insertOutboxRow({ created_at_utc: past })
    const newId = await insertOutboxRow({ created_at_utc: recent })

    const response = await request(app)
      .get('/outbox')
      .query({ created_to: '2021-01-01T00:00:00.000Z' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    const ids = body.items.map((i) => i.id)
    expect(ids).toContain(oldId)
    expect(ids).not.toContain(newId)
  })

  it('should return 400 for an invalid created_from date', async () => {
    const response = await request(app)
      .get('/outbox')
      .query({ created_from: 'not-a-date' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(400)
  })

  it('should return 400 for an invalid created_to date', async () => {
    const response = await request(app)
      .get('/outbox')
      .query({ created_to: 'not-a-date' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(400)
  })

  it('should return 400 for an invalid processed_from date', async () => {
    const response = await request(app)
      .get('/outbox')
      .query({ processed_from: 'not-a-date' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(400)
  })

  it('should return 400 for an invalid processed_to date', async () => {
    const response = await request(app)
      .get('/outbox')
      .query({ processed_to: 'not-a-date' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(400)
  })

  it('should return items ordered by created_at_utc descending', async () => {
    const earlierId = await insertOutboxRow({ created_at_utc: new Date('2024-01-01T10:00:00Z') })
    const laterId = await insertOutboxRow({ created_at_utc: new Date('2024-01-02T10:00:00Z') })

    const response = await request(app)
      .get('/outbox')
      .query({ created_from: '2024-01-01T00:00:00.000Z', created_to: '2024-01-03T00:00:00.000Z' })
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    const body = response.body as OutboxListResponse
    const ids = body.items.map((i) => i.id)
    expect(ids.indexOf(laterId)).toBeLessThan(ids.indexOf(earlierId))
  })
})

// ─── PATCH /outbox/:id/retry ─────────────────────────────────────────────────

describe('PATCH /outbox/:id/retry', () => {
  it('should return 401 when no auth token is provided', async () => {
    const id = randomUUID()
    const response = await request(app).patch(`/outbox/${id}/retry`)
    expect(response.status).toBe(401)
  })

  it('should return 403 for a user without OUTBOX_ADMIN permission', async () => {
    const id = randomUUID()
    const response = await request(app)
      .patch(`/outbox/${id}/retry`)
      .set('Cookie', `accessToken=${noPermissionsToken}`)

    expect(response.status).toBe(403)
  })

  it('should return 200 and reset a FAILED row to PENDING', async () => {
    const id = await insertOutboxRow({
      status: 'FAILED',
      error_message: 'Something went wrong',
    })

    const response = await request(app)
      .patch(`/outbox/${id}/retry`)
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'Message queued for reprocessing' })

    const row = await getRowById(id)
    expect(row?.status).toBe('PENDING')
    expect(row?.error_message).toBeNull()
  })

  it('should clear the error_message when resetting to PENDING', async () => {
    const id = await insertOutboxRow({
      status: 'FAILED',
      error_message: 'Network timeout',
    })

    await request(app).patch(`/outbox/${id}/retry`).set('Cookie', `accessToken=${outboxAdminToken}`)

    const row = await getRowById(id)
    expect(row?.error_message).toBeNull()
  })

  it('should NOT change status for a PENDING row (only FAILED rows are retryable)', async () => {
    const id = await insertOutboxRow({ status: 'PENDING' })

    const response = await request(app)
      .patch(`/outbox/${id}/retry`)
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    // API still returns 200 (idempotent), but the row is unchanged
    expect(response.status).toBe(200)
    const row = await getRowById(id)
    expect(row?.status).toBe('PENDING')
  })

  it('should NOT change status for a SYNCED row', async () => {
    const id = await insertOutboxRow({
      status: 'SYNCED',
      processed_at: new Date(),
    })

    await request(app).patch(`/outbox/${id}/retry`).set('Cookie', `accessToken=${outboxAdminToken}`)

    const row = await getRowById(id)
    expect(row?.status).toBe('SYNCED')
  })

  it('should return 200 for a non-existent id (no-op update)', async () => {
    const nonExistentId = randomUUID()
    // Note: we do NOT push to testIds since it doesn't exist

    const response = await request(app)
      .patch(`/outbox/${nonExistentId}/retry`)
      .set('Cookie', `accessToken=${outboxAdminToken}`)

    expect(response.status).toBe(200)
  })
})
