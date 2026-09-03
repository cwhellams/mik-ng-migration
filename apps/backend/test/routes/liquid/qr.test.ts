import { inflateSync } from 'node:zlib'

import QRCode from 'qrcode'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/liquid/api.ts'
import {
  LiquidType,
  OilSource,
  QrResolveStatus,
  QrTargetType,
  type QrCode,
} from '@mik/contracts/liquid'
import { buildQrSheetPdf } from '../../../src/services/liquid/qrSheet.ts'
import { createQrBatch } from '../../../src/db/liquid-queries.ts'
import {
  asAdmin,
  asMember,
  asNobody,
  cleanupLiquid,
  insertCanister,
  mountRouter,
  PISTON_AIRCRAFT,
  trackedBatchIds,
} from './testSupport.ts'

const app = mountRouter('/liquid', router)

beforeEach(cleanupLiquid)
afterAll(cleanupLiquid)

/** Mints a batch through the API and tracks it for cleanup. */
const mintBatch = async (count = 2, label = 'Test batch') => {
  const res = await request(app)
    .post('/liquid/qr/batches')
    .set('Cookie', asAdmin)
    .send({ label, count })
  if (res.status === 201) trackedBatchIds.push(res.body.batch.batchId)
  return res
}

const firstStationId = async (): Promise<string> => stationIdByLabel('EFNU Jet A-1')

const stationIdByLabel = async (label: string): Promise<string> => {
  const station = await db
    .selectFrom('liquid.fuelStation')
    .select(['stationId'])
    .where('label', '=', label)
    .executeTakeFirstOrThrow()
  return station.stationId
}

describe('permissions', () => {
  it('lets any liquid user resolve a scan — scanning is how a member reports', async () => {
    const batch = await mintBatch(1)
    const res = await request(app)
      .get(`/liquid/qr/${batch.body.codes[0].code}/resolve`)
      .set('Cookie', asMember)
    expect(res.status).toBe(200)
  })

  it('rejects a member with no permissions', async () => {
    const res = await request(app).get('/liquid/qr/MIK-L-XXXXX/resolve').set('Cookie', asNobody)
    expect(res.status).toBe(403)
  })

  it.each([
    ['list batches', 'get', '/liquid/qr/batches'],
    ['list codes', 'get', '/liquid/qr'],
    ['list targets', 'get', '/liquid/qr/targets'],
    ['mint a batch', 'post', '/liquid/qr/batches'],
  ])('refuses an ordinary member trying to %s', async (_name, method, path) => {
    const res = await (request(app) as never as Record<string, CallableFunction>)[method]!(path)
      .set('Cookie', asMember)
      .send({ label: 'x', count: 1 })
    expect(res.status).toBe(403)
  })

  it('refuses an ordinary member assigning a code', async () => {
    // "Non-admin users cannot assign unassigned QR codes."
    const batch = await mintBatch(1)
    const canisterId = await insertCanister()

    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asMember)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    expect(res.status).toBe(403)
  })
})

describe('POST /liquid/qr/batches', () => {
  it('mints unassigned identities before any target exists', async () => {
    // "Generate QR identities before assigning them to a target."
    const res = await mintBatch(5, 'Hangar shelf')

    expect(res.status).toBe(201)
    expect(res.body.batch).toMatchObject({ label: 'Hangar shelf', codeCount: 5, assignedCount: 0 })
    expect(res.body.codes).toHaveLength(5)
    expect(res.body.codes.every((c: { targetType: null }) => c.targetType === null)).toBe(true)
  })

  it('gives every code a distinct, readable identifier', async () => {
    const res = await mintBatch(20)
    const codes = res.body.codes.map((c: { code: string }) => c.code)

    expect(new Set(codes).size).toBe(20)
    // Crockford base32 without I, L, O or U — the four misread off a sticker.
    expect(codes.every((c: string) => /^MIK-L-[0-9A-HJKMNP-TV-Z]{5}$/.test(c))).toBe(true)
  })

  it('caps a batch at eight A4 sheets', async () => {
    const res = await request(app)
      .post('/liquid/qr/batches')
      .set('Cookie', asAdmin)
      .send({ label: 'Too many', count: 200 })
    expect(res.status).toBe(400)
  })

  it('requires a label, so a stack of printed sheets can be told apart', async () => {
    const res = await request(app)
      .post('/liquid/qr/batches')
      .set('Cookie', asAdmin)
      .send({ count: 2 })
    expect(res.status).toBe(400)
  })

  it('tops back up to the requested count when a generated code collides with an existing one', async () => {
    // Regression (B17): filtering out already-taken codes used to stop there,
    // so codeCount and the actual number of issued codes could disagree.
    // A deterministic `random` generates a distinct code per call (counter 0,
    // 1, 2, ... in the same base-32 alphabet the route uses); pre-seeding the
    // 2nd one as already taken forces exactly one collision, which the
    // top-up round must make up for.
    const codeForCounter = (n: number): string => {
      const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
      let s = ''
      for (let i = 0; i < 5; i++) {
        s = alphabet[n % 32] + s
        n = Math.floor(n / 32)
      }
      return `MIK-L-${s}`
    }
    let counter = 0
    const deterministicRandom = (bytes: number): Uint8Array => {
      const arr = new Uint8Array(bytes)
      let n = counter++
      for (let i = bytes - 1; i >= 0; i--) {
        arr[i] = n % 32
        n = Math.floor(n / 32)
      }
      return arr
    }

    const existingBatch = await db
      .insertInto('liquid.qrBatch')
      .values({
        label: 'LIQUID-TEST pre-seeded',
        codeCount: 1,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .returning('batchId')
      .executeTakeFirstOrThrow()
    trackedBatchIds.push(existingBatch.batchId)
    await db
      .insertInto('liquid.qrCode')
      .values({
        code: codeForCounter(1),
        batchId: existingBatch.batchId,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const { batch, codes } = await createQrBatch(
      'LIQUID-TEST top-up',
      3,
      'k1mnimda',
      deterministicRandom,
    )
    trackedBatchIds.push(batch.batchId)

    expect(codes).toHaveLength(3)
    expect(batch.codeCount).toBe(3)
    expect(codes.map((c) => c.code)).not.toContain(codeForCounter(1))
  })
})

describe('GET /liquid/qr/batches/:batchId/sheet.pdf', () => {
  it('renders a printable PDF through the real logo-composited generator', async () => {
    // The one test that exercises `generateQRCodeWithLogo` end to end, and so
    // the one that proves the route is wired to it. Deliberately a single code:
    // sharp costs ~1.8s per image under Jest's VM modules, so the layout cases
    // below use a stub renderer instead.
    const batch = await mintBatch(1)
    const res = await request(app)
      .get(`/liquid/qr/batches/${batch.body.batch.batchId}/sheet.pdf`)
      .set('Cookie', asAdmin)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    // Inline, because the admin's next action is Ctrl-P.
    expect(res.headers['content-disposition']).toContain('inline')
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)

  it('404s an unknown batch', async () => {
    const res = await request(app)
      .get('/liquid/qr/batches/00000000-0000-4000-8000-000000000000/sheet.pdf')
      .set('Cookie', asAdmin)
    expect(res.status).toBe(404)
  })

  it('serves the same rendered bytes on a repeat request — a batch is immutable once minted', async () => {
    const batch = await mintBatch(1)
    const first = await request(app)
      .get(`/liquid/qr/batches/${batch.body.batch.batchId}/sheet.pdf`)
      .set('Cookie', asAdmin)
    const second = await request(app)
      .get(`/liquid/qr/batches/${batch.body.batch.batchId}/sheet.pdf`)
      .set('Cookie', asAdmin)

    expect(second.status).toBe(200)
    expect(Buffer.compare(first.body, second.body)).toBe(0)
  }, 30_000)
})

describe('buildQrSheetPdf layout', () => {
  const aCode = (index: number): QrCode => ({
    qrId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    code: `MIK-L-${String(index).padStart(5, '0')}`,
    batchId: null,
    batchLabel: null,
    targetType: null,
    targetId: null,
    targetLabel: null,
    assignedAt: null,
    assignedBy: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBy: 'k1mnimda',
    updatedAt: '2026-06-01T00:00:00.000Z',
    updatedBy: 'k1mnimda',
  })

  /**
   * A real QR PNG, generated once, with no logo composited onto it — so pdfkit
   * gets an image it can actually embed while sharp stays out of the way.
   */
  let stubPng: Buffer
  beforeAll(async () => {
    stubPng = await QRCode.toBuffer('https://mik.fi/liquid/scan/STUB', {
      type: 'png',
      width: 64,
      margin: 1,
    })
  })

  const build = (count: number, urls: string[] = []) =>
    buildQrSheetPdf(
      Array.from({ length: count }, (_, i) => aCode(i)),
      {
        publicUrl: 'https://mik.fi',
        batchLabel: 'Hangar shelf',
        renderCode: async (url) => {
          urls.push(url)
          return stubPng
        },
      },
    )

  /** pdfkit writes one `/Type /Page` object per page. */
  const pageCount = (pdf: Buffer) =>
    (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

  it.each([
    [1, 1],
    [12, 1],
    [13, 2],
    [24, 2],
    [25, 3],
  ])('lays %i codes onto %i A4 sheet(s)', async (codes, pages) => {
    expect(pageCount(await build(codes))).toBe(pages)
  })

  it('encodes only the scan path, never the resolved target', async () => {
    // What lets a sheet be printed today and assigned over the following weeks.
    const urls: string[] = []
    await build(2, urls)
    expect(urls).toEqual([
      'https://mik.fi/liquid/scan/MIK-L-00000',
      'https://mik.fi/liquid/scan/MIK-L-00001',
    ])
  })

  /**
   * The text pdfkit actually drew.
   *
   * Two layers have to come off to see it, and both are why a naive
   * `expect(pdf.toString()).toContain('...')` would pass or fail for reasons
   * unrelated to the caption being there: the page content streams are
   * Flate-compressed, and the glyphs inside them are written as hex string
   * literals (`<4d494b...> TJ`) rather than plain text.
   */
  const drawnText = (pdf: Buffer): string => {
    const raw = pdf.toString('latin1')
    let out = ''
    // Each `stream ... endstream` pair is one object's payload. The content ones
    // inflate; an image's does not, and that failure just means "not text".
    for (const [, body] of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      let content: string
      try {
        content = inflateSync(Buffer.from(body!, 'latin1')).toString('latin1')
      } catch {
        continue
      }
      for (const [, hex] of content.matchAll(/<([0-9a-fA-F]+)>/g)) {
        out += Buffer.from(hex!, 'hex').toString('latin1')
      }
    }
    return out
  }

  it('prints the caption and the human-readable code under each image', async () => {
    const text = drawnText(await build(2))

    // "QR codes include ... `MIK Liquid reporting` beneath, plus a
    // human-readable identifier where space allows."
    expect(text).toContain('MIK Liquid reporting')
    expect(text).toContain('MIK-L-00000')
    expect(text).toContain('MIK-L-00001')
  })

  it('heads each sheet with the batch label', async () => {
    // So a stack of printed sheets can be told apart before anything is stuck down.
    expect(drawnText(await build(1))).toContain('Hangar shelf')
  })

  it('produces a valid single-page document for an empty batch', async () => {
    // A batch whose codes were all deleted shouldn't crash the print button.
    const pdf = await build(0)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(1)
  })
})

describe('POST /liquid/qr/:code/assign', () => {
  it('binds a code to an oil canister', async () => {
    const batch = await mintBatch(1)
    const canisterId = await insertCanister({ clubCanisterRef: `QR-TEST ${Date.now()}` })

    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      targetType: QrTargetType.OIL_CANISTER,
      targetId: canisterId,
      assignedBy: 'k1mnimda',
    })
    expect(res.body.assignedAt).not.toBeNull()
  })

  it('refuses to reassign an assigned code', async () => {
    // "QR codes are permanently bound after assignment." The sticker is
    // physically on the object; repointing it would send every future scan to
    // the wrong canister.
    const batch = await mintBatch(1)
    const first = await insertCanister()
    const second = await insertCanister()
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: first })

    const again = await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: second })

    expect(again.status).toBe(409)
    expect(again.body.detail).toContain('cannot be reassigned')
  })

  it('is refused by the database if a reassignment is attempted directly', async () => {
    // The API check is not the only line of defence.
    const batch = await mintBatch(1)
    const canisterId = await insertCanister()
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    await expect(
      db
        .updateTable('liquid.qrCode')
        .set({ targetId: '00000000-0000-4000-8000-000000000000', updatedBy: 'k1mnimda' })
        .where('code', '=', code)
        .execute(),
    ).rejects.toThrow(/cannot be reassigned/)
  })

  it('binds a code to a fuel station', async () => {
    const batch = await mintBatch(1)
    const stationId = await firstStationId()

    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.FUEL_STATION, targetId: stationId })

    expect(res.status).toBe(200)
    expect(res.body.targetLabel).toBe('EFNU Jet A-1')
  })

  it('refuses an empty canister — the identity would be burnt on dead stock', async () => {
    const batch = await mintBatch(1)
    const canisterId = await insertCanister({ isEmpty: true })

    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('empty')
  })

  it('refuses an unknown target', async () => {
    const batch = await mintBatch(1)
    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({
        targetType: QrTargetType.OIL_CANISTER,
        targetId: '00000000-0000-4000-8000-000000000000',
      })

    expect(res.status).toBe(400)
  })

  it('refuses a malformed targetId with a clean 400, not a database error', async () => {
    // targetId reaches a `WHERE canister_id = $1` (or station_id) with no
    // try/catch — a non-UUID string used to surface as an unhandled Postgres
    // "invalid input syntax for type uuid" 500 instead of a validation error.
    const batch = await mintBatch(1)
    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: 'not-a-uuid' })

    expect(res.status).toBe(400)
  })

  it('refuses a target type that does not exist', async () => {
    const batch = await mintBatch(1)
    const res = await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: 'AIRCRAFT', targetId: 'OH-STL' })

    expect(res.status).toBe(400)
  })

  it('404s a code the club never issued', async () => {
    const canisterId = await insertCanister()
    const res = await request(app)
      .post('/liquid/qr/MIK-L-NOPE1/assign')
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })
    expect(res.status).toBe(404)
  })
})

describe('GET /liquid/qr/:code/resolve', () => {
  it('prefills oil reporting from a canister sticker', async () => {
    const batch = await mintBatch(1)
    const canisterId = await insertCanister({
      aircraftRegistration: PISTON_AIRCRAFT,
      clubCanisterRef: `MIK RESOLVE ${Date.now()}`,
    })
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    const res = await request(app).get(`/liquid/qr/${code}/resolve`).set('Cookie', asMember)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe(QrResolveStatus.ASSIGNED)
    expect(res.body.prefill).toMatchObject({
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canisterId,
    })
    expect(res.body.prefill.label).toContain(PISTON_AIRCRAFT)
  })

  it('prefills fuel reporting from a pump sticker, leaving the aircraft open', async () => {
    // "Example: OH-STL + Nummela + Jet A-1 opens a form where the member only
    // enters the quantity." A shared pump doesn't know the aircraft, so that one
    // stays for the member.
    const batch = await mintBatch(1)
    const stationId = await firstStationId()
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.FUEL_STATION, targetId: stationId })

    const res = await request(app).get(`/liquid/qr/${code}/resolve`).set('Cookie', asMember)

    expect(res.body.prefill).toMatchObject({
      liquidType: LiquidType.FUEL,
      airport: 'EFNU',
      fuelType: 'JET A-1',
      providerName: 'Lentokoneosakeyhtiö Lokki & Kumppanit',
    })
    expect(res.body.prefill.aircraftRegistration).toBeUndefined()
  })

  it('prefills the aircraft and provider from a plane-mounted Kanair sticker, leaving the airport open', async () => {
    // Kanair fuels wherever OH-IHQ happens to be, not at a fixed pump, and
    // sells both grades OH-IHQ takes — so unlike the EFNU pumps, neither the
    // airport nor the fuel type is known in advance; only the plane and the
    // seller are.
    const batch = await mintBatch(1)
    const stationId = await stationIdByLabel('OH-IHQ Kanair')
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.FUEL_STATION, targetId: stationId })

    const res = await request(app).get(`/liquid/qr/${code}/resolve`).set('Cookie', asMember)

    expect(res.body.prefill).toMatchObject({
      liquidType: LiquidType.FUEL,
      aircraftRegistration: PISTON_AIRCRAFT,
      providerName: 'Kanair',
    })
    expect(res.body.prefill.airport).toBeUndefined()
    expect(res.body.prefill.fuelType).toBeUndefined()
    // Neither airport nor fuel type name anything, so the label falls back to
    // the provider rather than reading as a bare "OH-IHQ".
    expect(res.body.prefill.label).toBe('OH-IHQ · Kanair')
  })

  it('prefills the fixed grade from a plane-mounted Kanair sticker that only sells one', async () => {
    const batch = await mintBatch(1)
    const stationId = await stationIdByLabel('OH-STL Kanair JET A-1')
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.FUEL_STATION, targetId: stationId })

    const res = await request(app).get(`/liquid/qr/${code}/resolve`).set('Cookie', asMember)

    expect(res.body.prefill).toMatchObject({
      liquidType: LiquidType.FUEL,
      aircraftRegistration: 'OH-STL',
      fuelType: 'JET A-1',
      providerName: 'Kanair',
    })
    expect(res.body.prefill.airport).toBeUndefined()
  })

  it('offers the assignment flow to a liquid admin scanning a blank code', async () => {
    const batch = await mintBatch(1)
    const res = await request(app)
      .get(`/liquid/qr/${batch.body.codes[0].code}/resolve`)
      .set('Cookie', asAdmin)

    expect(res.body.status).toBe(QrResolveStatus.UNASSIGNED_ASSIGNABLE)
    expect(res.body.qr).toBeDefined()
  })

  it('tells an ordinary member a blank code is unassigned, and nothing more', async () => {
    const batch = await mintBatch(1)
    const res = await request(app)
      .get(`/liquid/qr/${batch.body.codes[0].code}/resolve`)
      .set('Cookie', asMember)

    expect(res.body.status).toBe(QrResolveStatus.UNASSIGNED)
    // No `qr` payload: the member cannot assign it, so they are not offered it.
    expect(res.body.qr).toBeUndefined()
  })

  it('404s a code the club never issued', async () => {
    const res = await request(app).get('/liquid/qr/MIK-L-NOPE1/resolve').set('Cookie', asMember)
    expect(res.status).toBe(404)
  })

  it('410s a sticker whose target has been removed', async () => {
    // A dangling sticker: the binding is permanent, so it cannot be repointed —
    // the scan has to say so rather than render a half-filled form.
    const batch = await mintBatch(1)
    const canisterId = await insertCanister()
    const code = batch.body.codes[0].code

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })
    await db.deleteFrom('liquid.oilCanister').where('canisterId', '=', canisterId).execute()

    const res = await request(app).get(`/liquid/qr/${code}/resolve`).set('Cookie', asMember)
    expect(res.status).toBe(410)
  })
})

describe('GET /liquid/qr', () => {
  it('narrows to codes still waiting to be stuck on something', async () => {
    const batch = await mintBatch(2)
    const canisterId = await insertCanister()
    const [assigned, unassigned] = batch.body.codes as { code: string }[]

    await request(app)
      .post(`/liquid/qr/${assigned!.code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    const res = await request(app)
      .get('/liquid/qr')
      .query({ batchId: batch.body.batch.batchId, unassignedOnly: 'true' })
      .set('Cookie', asAdmin)

    const codes = res.body.map((c: { code: string }) => c.code)
    expect(codes).toEqual([unassigned!.code])
  })

  it('still lists an assigned code when the toggle is sent off, not just when it is omitted', async () => {
    // Regression: the admin console always sends unassignedOnly as a literal
    // query string ('true'/'false'), and the schema used to coerce 'false' to
    // true — so an assigned code vanished from the list the moment it was
    // assigned, no matter what the toggle showed.
    const batch = await mintBatch(1)
    const canisterId = await insertCanister()
    const code = batch.body.codes[0].code as string

    await request(app)
      .post(`/liquid/qr/${code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    const res = await request(app)
      .get('/liquid/qr')
      .query({ batchId: batch.body.batch.batchId, unassignedOnly: 'false' })
      .set('Cookie', asAdmin)

    expect(res.body.map((c: { code: string }) => c.code)).toEqual([code])
  })

  it('counts a batch’s assigned codes', async () => {
    const batch = await mintBatch(3)
    const canisterId = await insertCanister()
    await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    const res = await request(app).get('/liquid/qr/batches').set('Cookie', asAdmin)
    const mine = res.body.find(
      (b: { batchId: string }) => b.batchId === batch.body.batch.batchId,
    ) as { codeCount: number; assignedCount: number }

    expect(mine).toMatchObject({ codeCount: 3, assignedCount: 1 })
  })
})

describe('GET /liquid/qr/targets', () => {
  it('lists canisters and pumps a code can still be pointed at', async () => {
    const canisterId = await insertCanister({ clubCanisterRef: `MIK TARGET ${Date.now()}` })

    const res = await request(app).get('/liquid/qr/targets').set('Cookie', asAdmin)

    expect(res.status).toBe(200)
    expect(res.body.oilCanisters.map((t: { targetId: string }) => t.targetId)).toContain(canisterId)
    expect(res.body.fuelStations.map((t: { label: string }) => t.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('EFNU Jet A-1')]),
    )
  })

  it('drops a canister that already has a sticker', async () => {
    const batch = await mintBatch(1)
    const canisterId = await insertCanister()
    await request(app)
      .post(`/liquid/qr/${batch.body.codes[0].code}/assign`)
      .set('Cookie', asAdmin)
      .send({ targetType: QrTargetType.OIL_CANISTER, targetId: canisterId })

    const res = await request(app).get('/liquid/qr/targets').set('Cookie', asAdmin)
    expect(res.body.oilCanisters.map((t: { targetId: string }) => t.targetId)).not.toContain(
      canisterId,
    )
  })
})
