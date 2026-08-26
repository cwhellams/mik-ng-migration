import request from 'supertest'
import sharp from 'sharp'

import { router } from '../../../src/routes/liquid/api.ts'
import {
  ABROAD,
  asAdmin,
  asMember,
  asNobody,
  asOtherMember,
  cleanupClaims,
  cleanupLiquid,
  daysAgo,
  insertDraftClaim,
  insertRecord,
  insertRecordAttachment,
  mountRouter,
} from './testSupport.ts'

/**
 * The optional receipt a member captures while reporting a self-paid fuelling
 * (#1119 follow-up) — separate from the expense claim's own attachments, which
 * `expenseClaimIntegration.test.ts` covers, including the copy from here onto
 * a claim.
 */

const app = mountRouter('/liquid', router)

const cleanup = async () => {
  await cleanupClaims()
  await cleanupLiquid()
}

beforeEach(cleanup)
afterAll(cleanup)

/** A fuelling the member paid for away from home — a real receipt-bearing record. */
const aPaidFuelling = (overrides: Parameters<typeof insertRecord>[0] = {}) =>
  insertRecord({ airport: ABROAD, providerCode: 'AIRBP', totalCost: 400, ...overrides })

const testImage = async (): Promise<Buffer> =>
  sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .jpeg()
    .toBuffer()

const upload = async (cookie: string, recordId: string, filenames: string[] = ['receipt.jpg']) => {
  const image = await testImage()
  let req = request(app).post(`/liquid/records/${recordId}/attachments`).set('Cookie', cookie)
  for (const name of filenames) {
    req = req.attach('files', image, { filename: name, contentType: 'image/jpeg' })
  }
  return req
}

describe('POST /records/:recordId/attachments', () => {
  it('uploads a receipt onto the member’s own record', async () => {
    const recordId = await aPaidFuelling()
    const res = await upload(asMember, recordId)

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ recordId, fileName: 'receipt.jpg' })

    const listed = await request(app)
      .get(`/liquid/records/${recordId}/attachments`)
      .set('Cookie', asMember)
    expect(listed.body).toHaveLength(1)
  })

  it('accepts several files in one request, up to the cap', async () => {
    const recordId = await aPaidFuelling()
    const res = await upload(asMember, recordId, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'])
    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(5)
  })

  it('rejects a request that would push the record past the cap', async () => {
    const recordId = await aPaidFuelling()
    await upload(asMember, recordId, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'])

    const res = await upload(asMember, recordId, ['f.jpg'])
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('at most 5')
  })

  it('rejects another member’s record with 404, not 403', async () => {
    const recordId = await aPaidFuelling()
    const res = await upload(asOtherMember, recordId)
    expect(res.status).toBe(404)
  })

  it('rejects a record past its edit window — the same lock a direct edit enforces', async () => {
    const recordId = await aPaidFuelling({ createdAt: daysAgo(8) })
    const res = await upload(asMember, recordId)
    expect(res.status).toBe(409)
  })

  it('rejects a record already linked to an expense claim', async () => {
    const claimId = await insertDraftClaim()
    const recordId = await aPaidFuelling({ expenseClaimId: claimId })
    const res = await upload(asMember, recordId)
    expect(res.status).toBe(409)
  })

  it('lets a liquid admin attach a receipt to someone else’s record', async () => {
    const recordId = await aPaidFuelling()
    const res = await upload(asAdmin, recordId)
    expect(res.status).toBe(201)
  })

  it('requires at least one file', async () => {
    const recordId = await aPaidFuelling()
    const res = await request(app)
      .post(`/liquid/records/${recordId}/attachments`)
      .set('Cookie', asMember)
    expect(res.status).toBe(400)
  })

  it('rejects an invalid token with 401', async () => {
    const recordId = await aPaidFuelling()
    const res = await upload('accessToken=INVALID', recordId)
    expect(res.status).toBe(401)
  })
})

describe('GET /records/:recordId/attachments/:attachmentId/url', () => {
  it('returns a presigned URL for the owner', async () => {
    const recordId = await aPaidFuelling()
    const attachmentId = await insertRecordAttachment(recordId)

    const res = await request(app)
      .get(`/liquid/records/${recordId}/attachments/${attachmentId}/url`)
      .set('Cookie', asMember)

    expect(res.status).toBe(200)
    expect(res.body.url).toBeTruthy()
  })

  it('still allows viewing after the record is locked (claimed) — only editing is blocked', async () => {
    const claimId = await insertDraftClaim()
    const recordId = await aPaidFuelling({ expenseClaimId: claimId })
    const attachmentId = await insertRecordAttachment(recordId)

    const res = await request(app)
      .get(`/liquid/records/${recordId}/attachments/${attachmentId}/url`)
      .set('Cookie', asMember)

    expect(res.status).toBe(200)
  })

  it('hides another member’s record with 404', async () => {
    const recordId = await aPaidFuelling()
    const attachmentId = await insertRecordAttachment(recordId)

    const res = await request(app)
      .get(`/liquid/records/${recordId}/attachments/${attachmentId}/url`)
      .set('Cookie', asOtherMember)

    expect(res.status).toBe(404)
  })

  it('404s for an attachment that does not belong to the record', async () => {
    const recordId = await aPaidFuelling()
    const res = await request(app)
      .get(`/liquid/records/${recordId}/attachments/999999/url`)
      .set('Cookie', asMember)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /records/:recordId/attachments/:attachmentId', () => {
  it('deletes the member’s own attachment', async () => {
    const recordId = await aPaidFuelling()
    const attachmentId = await insertRecordAttachment(recordId)

    const res = await request(app)
      .delete(`/liquid/records/${recordId}/attachments/${attachmentId}`)
      .set('Cookie', asMember)

    expect(res.status).toBe(204)
    const listed = await request(app)
      .get(`/liquid/records/${recordId}/attachments`)
      .set('Cookie', asMember)
    expect(listed.body).toHaveLength(0)
  })

  it('refuses once the record is locked (claimed)', async () => {
    const claimId = await insertDraftClaim()
    const recordId = await aPaidFuelling({ expenseClaimId: claimId })
    const attachmentId = await insertRecordAttachment(recordId)

    const res = await request(app)
      .delete(`/liquid/records/${recordId}/attachments/${attachmentId}`)
      .set('Cookie', asMember)

    expect(res.status).toBe(409)
  })

  it('rejects another member’s attachment with 404', async () => {
    const recordId = await aPaidFuelling()
    const attachmentId = await insertRecordAttachment(recordId)

    const res = await request(app)
      .delete(`/liquid/records/${recordId}/attachments/${attachmentId}`)
      .set('Cookie', asOtherMember)

    expect(res.status).toBe(404)
  })

  it('rejects an invalid token with 401', async () => {
    const recordId = await aPaidFuelling()
    const attachmentId = await insertRecordAttachment(recordId)
    const res = await request(app).delete(`/liquid/records/${recordId}/attachments/${attachmentId}`)
    expect(res.status).toBe(401)
  })
})

describe('permissions', () => {
  it('rejects a signed-in member with no liquid permission', async () => {
    const recordId = await aPaidFuelling()
    const res = await upload(asNobody, recordId)
    expect(res.status).toBe(403)
  })
})
