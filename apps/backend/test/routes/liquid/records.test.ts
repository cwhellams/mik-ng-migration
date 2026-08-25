import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/liquid/api.ts'
import { LiquidLockReason, LiquidType, OilSource } from '@mik/contracts/liquid'
import {
  ABROAD,
  asAdmin,
  asMember,
  asNobody,
  asOtherMember,
  cleanupClaims,
  cleanupLiquid,
  daysAgo,
  HOME,
  insertCanister,
  insertDraftClaim,
  insertRecord,
  JET_AIRCRAFT,
  mountRouter,
  NEW_JET_FLIGHT,
  OTHER_MEMBERS_FLIGHT,
  PISTON_AIRCRAFT,
  trackedRecordIds,
  VALIDATED_PISTON_FLIGHT,
} from './testSupport.ts'

const app = mountRouter('/liquid', router)

const cleanup = async () => {
  await cleanupClaims()
  await cleanupLiquid()
}

beforeEach(cleanup)
afterAll(cleanup)

/** The happy-path fuel body: OH-STL, Jet A-1, at home, so no cost required. */
const homeFuel = (overrides: Record<string, unknown> = {}) => ({
  liquidType: LiquidType.FUEL,
  aircraftRegistration: JET_AIRCRAFT,
  airport: HOME,
  fuelType: 'JET A-1',
  quantityLitres: 150,
  ...overrides,
})

const post = (cookie: string, body: object) =>
  request(app).post('/liquid/records').set('Cookie', cookie).send(body)

/** Creates via the API and tracks the id, so cleanup finds it. */
const create = async (cookie: string, body: object) => {
  const res = await post(cookie, body)
  if (res.status === 201) trackedRecordIds.push(res.body.recordId)
  return res
}

// ─── Permissions ──────────────────────────────────────────────────────────────

describe('permissions', () => {
  it.each([
    ['GET /records', 'get', '/liquid/records'],
    ['GET /providers', 'get', '/liquid/providers'],
    ['POST /records', 'post', '/liquid/records'],
  ])('%s rejects an invalid token with 401', async (_name, method, path) => {
    const res = await (request(app) as never as Record<string, CallableFunction>)[method]!(
      path,
    ).set('Cookie', 'accessToken=INVALID')
    expect(res.status).toBe(401)
  })

  it.each([
    ['GET /records', 'get', '/liquid/records'],
    ['GET /providers', 'get', '/liquid/providers'],
  ])('%s rejects a member with no permissions with 403', async (_name, method, path) => {
    const res = await (request(app) as never as Record<string, CallableFunction>)[method]!(
      path,
    ).set('Cookie', asNobody)
    expect(res.status).toBe(403)
  })

  it('lets an ordinary flying member report an uplift', async () => {
    // Reporting the fuel you just put in is part of flying, not a privilege.
    const res = await create(asMember, homeFuel())
    expect(res.status).toBe(201)
  })
})

// ─── Creating a fuel record ───────────────────────────────────────────────────

describe('POST /liquid/records — fuel', () => {
  it('records an EFNU fuelling with no total cost', async () => {
    const res = await create(asMember, homeFuel())

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      liquidType: LiquidType.FUEL,
      aircraftRegistration: JET_AIRCRAFT,
      airport: HOME,
      fuelType: 'JET A-1',
      quantityLitres: 150,
      totalCost: null,
      memberId: 'Matti1',
      // At EFNU the provider follows from the fuel type — the member never
      // picked one.
      providerName: 'Lentokoneosakeyhtiö Lokki & Kumppanit',
    })
  })

  it.each([
    ['MOGAS 98E5', 'Moottoripurjelentäjät'],
    ['100LL', 'EFNU Polttoainemyynti'],
  ])('derives the EFNU provider for %s as %s', async (fuelType, providerName) => {
    const res = await create(
      asMember,
      homeFuel({ aircraftRegistration: PISTON_AIRCRAFT, fuelType }),
    )
    expect(res.status).toBe(201)
    expect(res.body.providerName).toBe(providerName)
  })

  it('refuses a provider the member picked at EFNU', async () => {
    // Otherwise a member could attribute a home-base fuelling to AirBP.
    const airbp = await db
      .selectFrom('liquid.fuelProvider')
      .select(['providerId'])
      .where('code', '=', 'AIRBP')
      .executeTakeFirstOrThrow()

    const res = await create(asMember, homeFuel({ providerId: airbp.providerId }))
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('always supplied by')
  })

  it('rejects an away-from-EFNU fuelling with no total cost', async () => {
    const res = await create(asMember, homeFuel({ airport: ABROAD }))
    expect(res.status).toBe(400)
    expect(res.body.errors?.map((e: { path: string[] }) => e.path.join('.'))).toContain('totalCost')
  })

  it('requires a provider away from EFNU', async () => {
    const res = await create(asMember, homeFuel({ airport: ABROAD, totalCost: 400 }))
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('provider is required')
  })

  it('flags Jet A-1 bought outside Finland as tax included', async () => {
    const airbp = await db
      .selectFrom('liquid.fuelProvider')
      .select(['providerId'])
      .where('code', '=', 'AIRBP')
      .executeTakeFirstOrThrow()

    const res = await create(
      asMember,
      homeFuel({ airport: ABROAD, totalCost: 400, providerId: airbp.providerId }),
    )
    expect(res.status).toBe(201)
    expect(res.body.taxIncludedAbroad).toBe(true)
  })

  it('does not flag a Finnish fuelling as tax included', async () => {
    const res = await create(asMember, homeFuel({ airport: 'EFHK', totalCost: 400, providerId: 4 }))
    expect(res.status).toBe(201)
    expect(res.body.taxIncludedAbroad).toBe(false)
  })

  it('lets the member override the abroad flag', async () => {
    const res = await create(
      asMember,
      homeFuel({ airport: ABROAD, totalCost: 400, providerId: 4, taxIncludedAbroad: false }),
    )
    expect(res.status).toBe(201)
    expect(res.body.taxIncludedAbroad).toBe(false)
  })

  // "Fuel type is constrained by aircraft."
  it('refuses 100LL in the jet', async () => {
    const res = await create(asMember, homeFuel({ fuelType: '100LL' }))
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('does not take 100LL')
  })

  it('refuses Jet A-1 in the piston aircraft', async () => {
    const res = await create(asMember, homeFuel({ aircraftRegistration: PISTON_AIRCRAFT }))
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('does not take JET A-1')
  })

  it('rejects an unknown aircraft', async () => {
    const res = await create(asMember, homeFuel({ aircraftRegistration: 'OH-XXX' }))
    expect(res.status).toBe(400)
  })

  it('requires an exchange rate for a non-EUR purchase', async () => {
    const res = await create(
      asMember,
      homeFuel({ airport: ABROAD, totalCost: 4000, providerId: 4, ccy: 'SEK' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.errors?.map((e: { path: string[] }) => e.path.join('.'))).toContain('fxRate')
  })

  it('stores a non-EUR purchase with its rate', async () => {
    const res = await create(
      asMember,
      homeFuel({ airport: ABROAD, totalCost: 4000, providerId: 4, ccy: 'SEK', fxRate: 0.09 }),
    )
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ ccy: 'SEK', fxRate: 0.09, totalCost: 4000 })
  })

  it('defaults the record time to now and lets the member set it', async () => {
    const backdated = '2026-01-02T08:30:00.000Z'
    const withTime = await create(asMember, homeFuel({ recordedAt: backdated }))
    expect(withTime.body.recordedAt).toBe(backdated)

    const withoutTime = await create(asMember, homeFuel())
    expect(new Date(withoutTime.body.recordedAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })
})

// ─── Creating an oil record ───────────────────────────────────────────────────

describe('POST /liquid/records — oil', () => {
  it('records club-canister oil, opens the canister and leaves stock alone', async () => {
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })

    const res = await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canisterId,
      quantityLitres: 0.4,
      remainingLitres: 0.6,
    })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ oilSource: OilSource.CANISTER, remainingLitres: 0.6 })

    const canister = await db
      .selectFrom('liquid.oilCanister')
      .selectAll()
      .where('canisterId', '=', canisterId)
      .executeTakeFirstOrThrow()

    // "Mark a canister as opened upon first use."
    expect(canister.isOpened).toBe(true)
    expect(canister.openedAt).not.toBeNull()
    expect(canister.isEmpty).toBe(false)
    // The reported remaining quantity is informational: nothing decrements
    // inventory from it (#1119 is explicit about this).
    expect(Number(canister.remainingLitres)).toBe(1)
  })

  it('marks the canister empty when the member says it ran out', async () => {
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })

    const res = await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canisterId,
      quantityLitres: 1,
      markCanisterEmpty: true,
    })
    expect(res.status).toBe(201)

    const canister = await db
      .selectFrom('liquid.oilCanister')
      .selectAll()
      .where('canisterId', '=', canisterId)
      .executeTakeFirstOrThrow()
    expect(canister.isEmpty).toBe(true)
    expect(canister.emptiedAt).not.toBeNull()
  })

  it('drops an emptied canister out of available inventory', async () => {
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })
    await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canisterId,
      quantityLitres: 1,
      markCanisterEmpty: true,
    })

    const available = await request(app).get('/liquid/oil-canisters').set('Cookie', asMember)
    expect(available.body.map((c: { canisterId: string }) => c.canisterId)).not.toContain(
      canisterId,
    )
  })

  it('refuses a canister assigned to a different aircraft', async () => {
    // "restricted to the canister's assigned aircraft"
    const canisterId = await insertCanister({ aircraftRegistration: PISTON_AIRCRAFT })

    const res = await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: JET_AIRCRAFT,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canisterId,
      quantityLitres: 0.4,
    })
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain(PISTON_AIRCRAFT)
  })

  it('refuses an already-empty canister', async () => {
    const canisterId = await insertCanister({
      aircraftRegistration: PISTON_AIRCRAFT,
      isEmpty: true,
    })
    const res = await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canisterId,
      quantityLitres: 0.4,
    })
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('empty')
  })

  it('records oil from another source with its own traceability details', async () => {
    const res = await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.OTHER,
      oilMake: 'Aeroshell',
      oilModelViscosity: 'W100',
      oilBatchNumber: 'FIELD-42',
      quantityLitres: 0.5,
    })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      oilSource: OilSource.OTHER,
      oilMake: 'Aeroshell',
      oilModelViscosity: 'W100',
      oilBatchNumber: 'FIELD-42',
      oilCanisterId: null,
    })
  })

  it('requires make, viscosity and batch for oil from another source', async () => {
    const res = await create(asMember, {
      liquidType: LiquidType.OIL,
      aircraftRegistration: PISTON_AIRCRAFT,
      oilSource: OilSource.OTHER,
      quantityLitres: 0.5,
    })
    expect(res.status).toBe(400)
    const paths = res.body.errors?.map((e: { path: string[] }) => e.path.join('.'))
    expect(paths).toEqual(
      expect.arrayContaining(['oilMake', 'oilModelViscosity', 'oilBatchNumber']),
    )
  })
})

// ─── Reading ──────────────────────────────────────────────────────────────────

describe('GET /liquid/records', () => {
  it('shows a member only their own records', async () => {
    await insertRecord({ memberId: 'Matti1' })
    await insertRecord({ memberId: 'Pekka1' })

    const res = await request(app).get('/liquid/records').set('Cookie', asMember)
    expect(res.status).toBe(200)
    expect(res.body.records.every((r: { memberId: string }) => r.memberId === 'Matti1')).toBe(true)
  })

  it('ignores a memberId filter from an ordinary member', async () => {
    // Without the server pinning the filter, ?memberId= would turn a
    // member-scoped list into a fleet-wide one.
    const otherId = await insertRecord({ memberId: 'Pekka1' })

    const res = await request(app)
      .get('/liquid/records')
      .query({ memberId: 'Pekka1' })
      .set('Cookie', asMember)

    expect(res.status).toBe(200)
    expect(res.body.records.map((r: { recordId: string }) => r.recordId)).not.toContain(otherId)
  })

  it('lets a liquid admin read another member’s records', async () => {
    const id = await insertRecord({ memberId: 'Pekka1' })
    const res = await request(app)
      .get('/liquid/records')
      .query({ memberId: 'Pekka1' })
      .set('Cookie', asAdmin)

    expect(res.body.records.map((r: { recordId: string }) => r.recordId)).toContain(id)
  })

  it('hides soft-deleted records from a member even when they ask for them', async () => {
    const id = await insertRecord()
    await request(app).delete(`/liquid/records/${id}`).set('Cookie', asMember)

    const asOwner = await request(app)
      .get('/liquid/records')
      .query({ includeDeleted: 'true' })
      .set('Cookie', asMember)
    expect(asOwner.body.records.map((r: { recordId: string }) => r.recordId)).not.toContain(id)

    const asLiquidAdmin = await request(app)
      .get('/liquid/records')
      .query({ includeDeleted: 'true', memberId: 'Matti1' })
      .set('Cookie', asAdmin)
    expect(asLiquidAdmin.body.records.map((r: { recordId: string }) => r.recordId)).toContain(id)
  })

  it('reports a total that matches the filter, not the whole table', async () => {
    await insertRecord({ liquidType: 'FUEL' })
    await insertRecord({ liquidType: 'FUEL' })
    const canisterId = await insertCanister()
    await insertRecord({ liquidType: 'OIL', oilCanisterId: canisterId, airport: null })

    const fuel = await request(app)
      .get('/liquid/records')
      .query({ liquidType: 'FUEL' })
      .set('Cookie', asMember)

    expect(fuel.body.total).toBe(fuel.body.records.length)
    expect(fuel.body.records).toHaveLength(2)
  })

  it('filters to unclaimed records', async () => {
    const claimId = await insertDraftClaim()
    const claimed = await insertRecord({ expenseClaimId: claimId, totalCost: 100 })
    const unclaimed = await insertRecord({ totalCost: 100 })

    const res = await request(app)
      .get('/liquid/records')
      .query({ unclaimed: 'true' })
      .set('Cookie', asMember)

    const ids = res.body.records.map((r: { recordId: string }) => r.recordId)
    expect(ids).toContain(unclaimed)
    expect(ids).not.toContain(claimed)
  })

  it('404s a record belonging to another member rather than admitting it exists', async () => {
    const id = await insertRecord({ memberId: 'Pekka1' })
    const res = await request(app).get(`/liquid/records/${id}`).set('Cookie', asMember)
    expect(res.status).toBe(404)
  })

  it('attaches the lock to every record so the UI need not re-derive it', async () => {
    const id = await insertRecord()
    const res = await request(app).get(`/liquid/records/${id}`).set('Cookie', asMember)
    expect(res.body.lock).toEqual({ canEdit: true, canDelete: true })
  })
})

// ─── Lock enforcement ─────────────────────────────────────────────────────────

describe('lock rules, enforced by the API', () => {
  it('lets the owner edit a fresh record', async () => {
    const id = await insertRecord()
    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 175 })

    expect(res.status).toBe(200)
    expect(res.body.quantityLitres).toBe(175)
  })

  it('refuses an edit from another member with a 404', async () => {
    const id = await insertRecord({ memberId: 'Matti1' })
    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asOtherMember)
      .send({ quantityLitres: 1 })
    expect(res.status).toBe(404)
  })

  it('locks the owner out after a week, naming the reason', async () => {
    const id = await insertRecord({ createdAt: daysAgo(8) })
    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 1 })

    expect(res.status).toBe(409)
    expect(res.body.lockReason).toBe(LiquidLockReason.EDIT_WINDOW_EXPIRED)
  })

  it('lets a liquid admin edit a record past the member’s window', async () => {
    const id = await insertRecord({ createdAt: daysAgo(90) })
    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asAdmin)
      .send({ quantityLitres: 42 })

    expect(res.status).toBe(200)
    expect(res.body.quantityLitres).toBe(42)
  })

  it('locks the owner out once the linked flight log is validated', async () => {
    const id = await insertRecord({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: 'MOGAS 98E5',
      providerCode: 'MPL',
      flightLogId: VALIDATED_PISTON_FLIGHT,
    })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 1 })

    expect(res.status).toBe(409)
    expect(res.body.lockReason).toBe(LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG)
  })

  it('makes a claim-linked record immutable for the owner', async () => {
    const claimId = await insertDraftClaim()
    const id = await insertRecord({ expenseClaimId: claimId, totalCost: 300 })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 1 })

    expect(res.status).toBe(409)
    expect(res.body.lockReason).toBe(LiquidLockReason.LINKED_TO_EXPENSE_CLAIM)
  })

  it('makes a claim-linked record immutable for a liquid admin too', async () => {
    // The one lock with no admin escape hatch: money has moved on these figures.
    const claimId = await insertDraftClaim()
    const id = await insertRecord({ expenseClaimId: claimId, totalCost: 300 })

    const patched = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asAdmin)
      .send({ quantityLitres: 1 })
    expect(patched.status).toBe(409)
    expect(patched.body.lockReason).toBe(LiquidLockReason.LINKED_TO_EXPENSE_CLAIM)

    const deleted = await request(app).delete(`/liquid/records/${id}`).set('Cookie', asAdmin)
    expect(deleted.status).toBe(409)
  })
})

// ─── Editing ──────────────────────────────────────────────────────────────────

describe('PATCH /liquid/records/:recordId', () => {
  it('leaves fields the body never mentioned alone', async () => {
    // The Zod .partial() trap: a schema that kept its defaults would reset ccy
    // and markCanisterEmpty on every PATCH.
    const id = await insertRecord({
      airport: ABROAD,
      totalCost: 4000,
      ccy: 'SEK',
      fxRate: 0.09,
      providerCode: 'AIRBP',
      taxIncludedAbroad: true,
    })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ quantityLitres: 99 })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      quantityLitres: 99,
      ccy: 'SEK',
      fxRate: 0.09,
      totalCost: 4000,
      taxIncludedAbroad: true,
    })
  })

  it('requires a total cost once the airport moves out of EFNU', async () => {
    // The create schema can't catch this: the record was legal when it was made.
    const id = await insertRecord({ airport: HOME, totalCost: null })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ airport: ABROAD })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('Total cost is required')
  })

  it('re-resolves the provider when the airport changes to EFNU', async () => {
    const id = await insertRecord({ airport: ABROAD, totalCost: 400, providerCode: 'AIRBP' })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ airport: HOME })

    expect(res.status).toBe(200)
    expect(res.body.providerName).toBe('Lentokoneosakeyhtiö Lokki & Kumppanit')
  })

  it('re-checks the aircraft’s fuel types on an edit', async () => {
    const id = await insertRecord()
    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ fuelType: '100LL' })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('does not take 100LL')
  })

  it('rejects a non-EUR ccy patched without an fxRate', async () => {
    // CreateLiquidRecordSchema enforces this pairing with a superRefine; a PATCH
    // has to check it against the merged record instead, since it may only
    // touch one of the two fields.
    const id = await insertRecord({ ccy: 'EUR', fxRate: null })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ ccy: 'SEK' })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('exchange rate')
  })

  it('rejects clearing fxRate while ccy is still non-EUR', async () => {
    const id = await insertRecord({ ccy: 'SEK', fxRate: 0.09, providerCode: 'AIRBP' })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ fxRate: null })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('exchange rate')
  })

  it('accepts ccy and fxRate patched together', async () => {
    const id = await insertRecord({ ccy: 'EUR', fxRate: null, totalCost: 100 })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ ccy: 'SEK', fxRate: 0.09 })

    expect(res.status).toBe(200)
    expect(res.body.ccy).toBe('SEK')
  })

  it('rejects setting an oil canister on a record sourced from elsewhere', async () => {
    const id = await insertRecord({
      liquidType: 'OIL',
      oilSource: 'OTHER',
      airport: null,
      quantityLitres: 0.5,
    })
    const canisterId = await insertCanister()

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ oilCanisterId: canisterId })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('another source')
  })

  it('rejects clearing the canister on a CANISTER-sourced oil record', async () => {
    const canisterId = await insertCanister()
    const id = await insertRecord({
      liquidType: 'OIL',
      oilSource: 'CANISTER',
      oilCanisterId: canisterId,
      airport: null,
      quantityLitres: 0.5,
    })

    const res = await request(app)
      .patch(`/liquid/records/${id}`)
      .set('Cookie', asMember)
      .send({ oilCanisterId: null })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('Select the canister')
  })

  it('rejects a fuel type an away-from-home provider does not sell', async () => {
    // None of the seeded away providers (AirBP, Kanair, Other) restrict what
    // they sell, so this needs one that does — an away provider that only
    // sells Jet A-1, the same shape LOKKI has at the home base.
    const provider = await db
      .insertInto('liquid.fuelProvider')
      .values({
        code: 'TEST-AWAY-JETA1',
        name: 'LIQUID-TEST away Jet A-1 only',
        fuelTypes: ['JET A-1'],
        requiresTotalCost: true,
        isHomeBase: false,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .returning('providerId')
      .executeTakeFirstOrThrow()

    try {
      // OH-IHQ (unlike OH-STL) also takes 100LL, so this reaches
      // resolveProviderId rather than being turned away by the
      // aircraft-fuel-type guard first — and the PATCH doesn't send a
      // providerId, so the route falls back to the record's existing one
      // (recordsApi.ts: airport is unchanged) without re-checking it sells
      // the new fuel type.
      const id = await insertRecord({
        aircraftRegistration: PISTON_AIRCRAFT,
        airport: ABROAD,
        totalCost: 400,
        fuelType: 'JET A-1',
      })
      await db
        .updateTable('liquid.record')
        .set({ providerId: provider.providerId })
        .where('recordId', '=', id)
        .execute()

      const res = await request(app)
        .patch(`/liquid/records/${id}`)
        .set('Cookie', asMember)
        .send({ fuelType: '100LL' })

      expect(res.status).toBe(400)
      expect(res.body.detail).toContain('does not sell 100LL')
    } finally {
      // The record references the provider, so it has to go first; cleanupLiquid
      // (run before the *next* test) would otherwise leave it dangling here.
      await cleanupLiquid()
      await db
        .deleteFrom('liquid.fuelProvider')
        .where('providerId', '=', provider.providerId)
        .execute()
    }
  })
})

// ─── Deleting ─────────────────────────────────────────────────────────────────

describe('DELETE /liquid/records/:recordId', () => {
  it('soft deletes, leaving the row and the audit trail behind', async () => {
    const id = await insertRecord()
    const res = await request(app).delete(`/liquid/records/${id}`).set('Cookie', asMember)
    expect(res.status).toBe(204)

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', id)
      .executeTakeFirstOrThrow()

    expect(row.deletedAt).not.toBeNull()
    expect(row.deletedBy).toBe('Matti1')
  })

  it('audits the deletion with the actor who did it', async () => {
    const id = await insertRecord()
    await request(app).delete(`/liquid/records/${id}`).set('Cookie', asAdmin)

    const audit = await db
      .selectFrom('liquid.recordAudit')
      .selectAll()
      .where('recordId', '=', id)
      .orderBy('auditId', 'desc')
      .executeTakeFirstOrThrow()

    expect(audit.operationType).toBe('SOFT_DELETE')
    expect(audit.changedBy).toBe('k1mnimda')
  })

  it('404s a record another member deleted out from under it', async () => {
    const id = await insertRecord()
    await request(app).delete(`/liquid/records/${id}`).set('Cookie', asMember)
    const again = await request(app).delete(`/liquid/records/${id}`).set('Cookie', asMember)
    expect(again.status).toBe(409)
    expect(again.body.lockReason).toBe(LiquidLockReason.DELETED)
  })
})

// ─── Flight log linking ───────────────────────────────────────────────────────

describe('flight log linking', () => {
  it('links a record to the member’s own editable flight', async () => {
    const id = await insertRecord({ aircraftRegistration: JET_AIRCRAFT })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: NEW_JET_FLIGHT })

    expect(res.status).toBe(200)
    expect(res.body.flightLogId).toBe(NEW_JET_FLIGHT)
  })

  it('refuses a flight in a different aircraft', async () => {
    const id = await insertRecord({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: 'MOGAS 98E5',
      providerCode: 'MPL',
    })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: NEW_JET_FLIGHT })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain(JET_AIRCRAFT)
  })

  it('refuses a flight the member was not on', async () => {
    const id = await insertRecord()
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: OTHER_MEMBERS_FLIGHT })

    expect(res.status).toBe(403)
  })

  it('refuses an already-validated flight for a member', async () => {
    const id = await insertRecord({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: 'MOGAS 98E5',
      providerCode: 'MPL',
    })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: VALIDATED_PISTON_FLIGHT })

    expect(res.status).toBe(409)
  })

  it('lets a liquid admin link to a validated flight', async () => {
    const id = await insertRecord({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: 'MOGAS 98E5',
      providerCode: 'MPL',
    })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asAdmin)
      .send({ flightLogId: VALIDATED_PISTON_FLIGHT })

    expect(res.status).toBe(200)
  })

  it('refuses to move a record to a second flight', async () => {
    // "A liquid record can be linked to at most one flight log."
    const id = await insertRecord({ flightLogId: NEW_JET_FLIGHT })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: 'bLwnAstr0' })

    expect(res.status).toBe(409)
    expect(res.body.detail).toContain('already attached')
  })

  it('unlinks a record from its flight', async () => {
    const id = await insertRecord({ flightLogId: NEW_JET_FLIGHT })
    const res = await request(app)
      .post(`/liquid/records/${id}/unlink`)
      .set('Cookie', asMember)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.flightLogId).toBeNull()
  })

  it('creates a record attached to a flight in one request', async () => {
    const res = await create(asMember, homeFuel({ flightLogId: NEW_JET_FLIGHT }))
    expect(res.status).toBe(201)
    expect(res.body.flightLogId).toBe(NEW_JET_FLIGHT)
  })

  it('links a clubmate’s recent fuelling to a flight the caller is on, not the reporter', async () => {
    // "Fuel now, fly later, maybe a different person": Pekka1 fuelled the
    // aircraft; asMember (Matti1) is billable on NEW_JET_FLIGHT and flew it.
    const id = await insertRecord({
      memberId: 'Pekka1',
      aircraftRegistration: JET_AIRCRAFT,
      recordedAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: NEW_JET_FLIGHT })

    expect(res.status).toBe(200)
    expect(res.body.flightLogId).toBe(NEW_JET_FLIGHT)
  })

  it('refuses a clubmate’s fuelling once it is more than a day old', async () => {
    const id = await insertRecord({
      memberId: 'Pekka1',
      aircraftRegistration: JET_AIRCRAFT,
      recordedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: NEW_JET_FLIGHT })

    expect(res.status).toBe(409)
  })

  it('lets the member link their own fuelling regardless of age', async () => {
    const id = await insertRecord({
      aircraftRegistration: JET_AIRCRAFT,
      recordedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    })
    const res = await request(app)
      .post(`/liquid/records/${id}/link`)
      .set('Cookie', asMember)
      .send({ flightLogId: NEW_JET_FLIGHT })

    expect(res.status).toBe(200)
  })
})

describe('GET /liquid/records/linkable', () => {
  it('suggests the member’s recent unlinked records for that aircraft', async () => {
    const linkable = await insertRecord({ aircraftRegistration: JET_AIRCRAFT })
    const alreadyLinked = await insertRecord({ flightLogId: NEW_JET_FLIGHT })
    const otherAircraft = await insertRecord({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: 'MOGAS 98E5',
      providerCode: 'MPL',
    })
    const staleOthers = await insertRecord({
      memberId: 'Pekka1',
      recordedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    })

    const res = await request(app)
      .get('/liquid/records/linkable')
      .query({ aircraftRegistration: JET_AIRCRAFT, liquidType: LiquidType.FUEL })
      .set('Cookie', asMember)

    const ids = res.body.records.map((r: { recordId: string }) => r.recordId)
    expect(ids).toContain(linkable)
    expect(ids).not.toContain(alreadyLinked)
    expect(ids).not.toContain(otherAircraft)
    expect(ids).not.toContain(staleOthers)
  })

  it('also suggests a clubmate’s recent fuelling — "fuel now, fly later, maybe a different person"', async () => {
    const recent = await insertRecord({
      memberId: 'Pekka1',
      recordedAt: new Date(Date.now() - 60 * 60 * 1000),
    })

    const res = await request(app)
      .get('/liquid/records/linkable')
      .query({ aircraftRegistration: JET_AIRCRAFT, liquidType: LiquidType.FUEL })
      .set('Cookie', asMember)

    expect(res.body.records.map((r: { recordId: string }) => r.recordId)).toContain(recent)
  })

  it('never suggests a claim-linked record, which could not be linked anyway', async () => {
    const claimId = await insertDraftClaim()
    const claimed = await insertRecord({ expenseClaimId: claimId, totalCost: 100 })

    const res = await request(app)
      .get('/liquid/records/linkable')
      .query({ aircraftRegistration: JET_AIRCRAFT, liquidType: LiquidType.FUEL })
      .set('Cookie', asMember)

    expect(res.body.records.map((r: { recordId: string }) => r.recordId)).not.toContain(claimed)
  })

  it('400s without an aircraft and liquid type', async () => {
    const res = await request(app).get('/liquid/records/linkable').set('Cookie', asMember)
    expect(res.status).toBe(400)
  })
})

// ─── Dashboard prompt ─────────────────────────────────────────────────────────

describe('GET /liquid/records/claimable', () => {
  it('counts only fuel the member paid for and has not claimed', async () => {
    const claimId = await insertDraftClaim()
    await insertRecord({ totalCost: 200, airport: ABROAD, providerCode: 'OTHER' })
    await insertRecord({ totalCost: 100, airport: ABROAD, providerCode: 'OTHER' })
    // No cost — EFNU fuelling is invoiced to the club, so it is not claimable.
    await insertRecord({ totalCost: null })
    // Already claimed.
    await insertRecord({ totalCost: 500, expenseClaimId: claimId, providerCode: 'OTHER' })

    const res = await request(app).get('/liquid/records/claimable').set('Cookie', asMember)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ count: 2, totalCostEur: 300 })
    expect(res.body.oldestRecordedAt).not.toBeNull()
  })

  it('converts a foreign-currency purchase into the EUR total', async () => {
    await insertRecord({
      totalCost: 4000,
      ccy: 'SEK',
      fxRate: 0.09,
      airport: ABROAD,
      providerCode: 'OTHER',
    })
    const res = await request(app).get('/liquid/records/claimable').set('Cookie', asMember)
    expect(res.body.totalCostEur).toBe(360)
  })

  it('never counts a club fuel card, even though it also carries a total cost', async () => {
    // AirBP/Kanair are club cards -- the total cost is recorded for
    // reconciliation, but the club paid, so there is nothing to claim back.
    await insertRecord({ totalCost: 200, airport: ABROAD, providerCode: 'AIRBP' })
    await insertRecord({ totalCost: 150, airport: ABROAD, providerCode: 'KANAIR' })

    const res = await request(app).get('/liquid/records/claimable').set('Cookie', asMember)

    expect(res.body).toEqual({ count: 0, totalCostEur: 0, oldestRecordedAt: null })
  })

  it('reports nothing to claim as zero rather than an error', async () => {
    const res = await request(app).get('/liquid/records/claimable').set('Cookie', asMember)
    expect(res.body).toEqual({ count: 0, totalCostEur: 0, oldestRecordedAt: null })
  })
})

// ─── Reference data ───────────────────────────────────────────────────────────

describe('GET /liquid/providers', () => {
  it('returns the seeded providers in display order', async () => {
    const res = await request(app).get('/liquid/providers').set('Cookie', asMember)
    expect(res.status).toBe(200)
    expect(res.body.map((p: { code: string }) => p.code)).toEqual([
      'MPL',
      'EFNU_FUEL',
      'LOKKI',
      'AIRBP',
      'KANAIR',
      'OTHER',
    ])
  })

  it('says which providers need a total cost and which are at the home base', async () => {
    const res = await request(app).get('/liquid/providers').set('Cookie', asMember)
    const byCode = Object.fromEntries(res.body.map((p: { code: string }) => [p.code, p])) as Record<
      string,
      {
        requiresTotalCost: boolean
        requiresClaim: boolean
        isHomeBase: boolean
        defaultAirport: string
      }
    >

    expect(byCode.LOKKI).toMatchObject({
      requiresTotalCost: false,
      isHomeBase: true,
      defaultAirport: HOME,
    })
    expect(byCode.AIRBP).toMatchObject({ requiresTotalCost: true, isHomeBase: false })
  })

  it('only "Other / own payment" requires a claim -- the club fuel cards do not', async () => {
    const res = await request(app).get('/liquid/providers').set('Cookie', asMember)
    const byCode = Object.fromEntries(res.body.map((p: { code: string }) => [p.code, p])) as Record<
      string,
      { requiresClaim: boolean }
    >

    // AirBP/Kanair are club fuel cards -- the club is billed directly, so a
    // total cost recorded through them is for reconciliation, not
    // reimbursement, and must not trigger the claimable-fuel dashboard prompt.
    expect(byCode.AIRBP.requiresClaim).toBe(false)
    expect(byCode.KANAIR.requiresClaim).toBe(false)
    expect(byCode.OTHER.requiresClaim).toBe(true)
  })
})
