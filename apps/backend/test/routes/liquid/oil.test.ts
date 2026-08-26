import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/liquid/api.ts'
import {
  asAdmin,
  asMember,
  asNobody,
  cleanupLiquid,
  insertCanister,
  insertRecord,
  JET_AIRCRAFT,
  mountRouter,
  PISTON_AIRCRAFT,
  trackedCanisterIds,
} from './testSupport.ts'

const app = mountRouter('/liquid', router)

beforeEach(cleanupLiquid)
afterAll(cleanupLiquid)

const aCanister = (overrides: Record<string, unknown> = {}) => ({
  clubCanisterRef: `MIK TEST ${Date.now()}${Math.random()}`,
  batchNumber: 'B-2026-01',
  manufacturingDate: '2026-01-15',
  make: 'Aeroshell',
  modelViscosity: 'W100',
  aircraftRegistration: PISTON_AIRCRAFT,
  initialLitres: 1,
  ...overrides,
})

const createCanister = async (cookie: string, body: object) => {
  const res = await request(app).post('/liquid/oil-canisters').set('Cookie', cookie).send(body)
  if (res.status === 201) trackedCanisterIds.push(res.body.canisterId)
  return res
}

describe('permissions', () => {
  it('lets any liquid user read inventory — a member has to pick a canister', async () => {
    const res = await request(app).get('/liquid/oil-canisters').set('Cookie', asMember)
    expect(res.status).toBe(200)
  })

  it('rejects a member with no permissions', async () => {
    const res = await request(app).get('/liquid/oil-canisters').set('Cookie', asNobody)
    expect(res.status).toBe(403)
  })

  it.each([
    ['create', 'post', '/liquid/oil-canisters'],
    ['suggest a reference', 'get', '/liquid/oil-canisters/suggest-ref'],
  ])('refuses an ordinary member trying to %s', async (_name, method, path) => {
    const res = await (request(app) as never as Record<string, CallableFunction>)[method]!(path)
      .set('Cookie', asMember)
      .send(aCanister())
    expect(res.status).toBe(403)
  })

  it('refuses an ordinary member editing inventory', async () => {
    const canisterId = await insertCanister()
    const res = await request(app)
      .patch(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asMember)
      .send({ isEmpty: true })
    expect(res.status).toBe(403)
  })

  it('refuses an ordinary member deleting inventory', async () => {
    const canisterId = await insertCanister()
    const res = await request(app)
      .delete(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asMember)
    expect(res.status).toBe(403)
  })
})

describe('POST /liquid/oil-canisters', () => {
  it('creates a canister full, with its aircraft assigned', async () => {
    const res = await createCanister(asAdmin, aCanister())

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      make: 'Aeroshell',
      modelViscosity: 'W100',
      batchNumber: 'B-2026-01',
      manufacturingDate: '2026-01-15',
      aircraftRegistration: PISTON_AIRCRAFT,
      initialLitres: 1,
      // A fresh canister is full.
      remainingLitres: 1,
      isOpened: false,
      isEmpty: false,
    })
  })

  it('stores decimal remaining volume', async () => {
    // "Remaining quantity in litres, including decimals."
    const created = await createCanister(asAdmin, aCanister({ initialLitres: 3.785 }))
    const res = await request(app)
      .patch(`/liquid/oil-canisters/${created.body.canisterId}`)
      .set('Cookie', asAdmin)
      .send({ remainingLitres: 2.125 })

    expect(res.body.remainingLitres).toBe(2.125)
  })

  it('rejects a duplicate club reference with a 409 naming it', async () => {
    // Two canisters of the same make arriving together is exactly when somebody
    // retypes a reference, so this needs to say which one clashed rather than
    // surfacing the constraint violation as a 500.
    const ref = `MIK DUP ${Date.now()}`
    await createCanister(asAdmin, aCanister({ clubCanisterRef: ref }))
    const again = await createCanister(asAdmin, aCanister({ clubCanisterRef: ref }))

    expect(again.status).toBe(409)
    expect(again.body.detail).toContain(ref)
  })

  it.each(['clubCanisterRef', 'batchNumber', 'make', 'modelViscosity', 'aircraftRegistration'])(
    'requires %s',
    async (field) => {
      const body = aCanister() as Record<string, unknown>
      delete body[field]
      const res = await createCanister(asAdmin, body)
      expect(res.status).toBe(400)
    },
  )
})

describe('PATCH /liquid/oil-canisters/:canisterId', () => {
  it('cannot move a canister to another aircraft', async () => {
    // Permanent from creation: an oil record already filed against it names the
    // aircraft the oil went into. The schema drops the field, so the aircraft is
    // simply unchanged rather than rejected — and the database trigger refuses
    // it too, if anything ever reaches it another way.
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })

    const res = await request(app)
      .patch(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)
      .send({ aircraftRegistration: JET_AIRCRAFT })

    expect(res.status).toBe(200)
    expect(res.body.aircraftRegistration).toBe(PISTON_AIRCRAFT)
  })

  it('is refused by the database if the aircraft is changed directly', async () => {
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })
    await expect(
      db
        .updateTable('liquid.oilCanister')
        .set({ aircraftRegistration: JET_AIRCRAFT, updatedBy: 'k1mnimda' })
        .where('canisterId', '=', canisterId)
        .execute(),
    ).rejects.toThrow(/permanent/)
  })

  it('stamps openedAt when the flag is set, and keeps the first one', async () => {
    const canisterId = await insertCanister()

    const first = await request(app)
      .patch(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)
      .send({ isOpened: true })
    expect(first.body.openedAt).not.toBeNull()

    const second = await request(app)
      .patch(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)
      .send({ isOpened: true })
    // The date a canister was opened doesn't change because somebody saved the
    // form again.
    expect(second.body.openedAt).toBe(first.body.openedAt)
  })

  it('clears emptiedAt when an empty canister is un-emptied', async () => {
    const canisterId = await insertCanister()
    await request(app)
      .patch(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)
      .send({ isEmpty: true })

    const res = await request(app)
      .patch(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)
      .send({ isEmpty: false })

    expect(res.body.isEmpty).toBe(false)
    expect(res.body.emptiedAt).toBeNull()
  })

  it('404s an unknown canister', async () => {
    const res = await request(app)
      .patch('/liquid/oil-canisters/00000000-0000-4000-8000-000000000000')
      .set('Cookie', asAdmin)
      .send({ isEmpty: true })
    expect(res.status).toBe(404)
  })
})

describe('GET /liquid/oil-canisters', () => {
  it('lists available stock and leaves out the empties', async () => {
    const available = await insertCanister()
    const empty = await insertCanister({ isEmpty: true })

    const res = await request(app).get('/liquid/oil-canisters').set('Cookie', asMember)
    const ids = res.body.map((c: { canisterId: string }) => c.canisterId)

    expect(ids).toContain(available)
    expect(ids).not.toContain(empty)
  })

  it('includes empties as history when asked', async () => {
    const empty = await insertCanister({ isEmpty: true })
    const res = await request(app)
      .get('/liquid/oil-canisters')
      .query({ includeEmpty: 'true' })
      .set('Cookie', asAdmin)

    expect(res.body.map((c: { canisterId: string }) => c.canisterId)).toContain(empty)
  })

  it('filters to one aircraft, which is what an oil report needs', async () => {
    const piston = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })
    const jet = await insertCanister({ aircraftRegistration: JET_AIRCRAFT })

    const res = await request(app)
      .get('/liquid/oil-canisters')
      .query({ aircraftRegistration: PISTON_AIRCRAFT })
      .set('Cookie', asMember)

    const ids = res.body.map((c: { canisterId: string }) => c.canisterId)
    expect(ids).toContain(piston)
    expect(ids).not.toContain(jet)
  })
})

describe('DELETE /liquid/oil-canisters/:canisterId', () => {
  it('deletes a canister nothing has been reported against', async () => {
    const canisterId = await insertCanister()
    const res = await request(app)
      .delete(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)
    expect(res.status).toBe(204)
  })

  it('refuses to delete a canister with oil records, pointing at "mark empty"', async () => {
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })
    await insertRecord({
      liquidType: 'OIL',
      aircraftRegistration: PISTON_AIRCRAFT,
      oilCanisterId: canisterId,
      airport: null,
      quantityLitres: 0.5,
    })

    const res = await request(app)
      .delete(`/liquid/oil-canisters/${canisterId}`)
      .set('Cookie', asAdmin)

    expect(res.status).toBe(409)
    expect(res.body.detail).toContain('Mark it empty')
  })
})

describe('GET /liquid/oil-canisters/suggest-ref', () => {
  it("suggests the club's MIK <initials> <YY>/<seq> label", async () => {
    const res = await request(app)
      .get('/liquid/oil-canisters/suggest-ref')
      .query({ make: 'Aeroshell' })
      .set('Cookie', asAdmin)

    expect(res.status).toBe(200)
    expect(res.body.clubCanisterRef).toMatch(
      new RegExp(`^MIK A ${String(new Date().getFullYear() % 100)}/\\d+$`),
    )
  })

  it('advances the sequence as canisters of that make accumulate', async () => {
    const make = `Testoil${Date.now()}`
    const before = await request(app)
      .get('/liquid/oil-canisters/suggest-ref')
      .query({ make })
      .set('Cookie', asAdmin)

    await insertCanister({ make })

    const after = await request(app)
      .get('/liquid/oil-canisters/suggest-ref')
      .query({ make })
      .set('Cookie', asAdmin)

    expect(after.body.clubCanisterRef).not.toBe(before.body.clubCanisterRef)
  })

  it('400s without a make', async () => {
    const res = await request(app).get('/liquid/oil-canisters/suggest-ref').set('Cookie', asAdmin)
    expect(res.status).toBe(400)
  })
})
