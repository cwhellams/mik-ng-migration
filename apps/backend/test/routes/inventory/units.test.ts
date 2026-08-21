import 'dotenv/config'
import { MIKPermissions } from '@mik/contracts/members'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router as inventoryRouter } from '../../../src/routes/inventory/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

/**
 * The item-unit endpoints under `/api/v1/inventory` (#1139).
 *
 * They sit with the catalog rather than with the reservation calendar on
 * purpose — creating a unit is stock-keeping, and writes are `INVENTORY_ADMIN`.
 * Reads are open to `INVENTORY_USER` because the reservation editor needs the
 * unit list to offer "this specific vest", which is what most of the assertions
 * below are actually protecting.
 */

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/inventory', inventoryRouter)
app.use(problemErrorHandler)

const tokenFor = (memberId: string, permissions: MIKPermissions[]) =>
  generateAccessToken({
    memberId,
    lastName: 'Test',
    email: `${memberId}@mik.fi`,
    roles: [],
    permissions,
    canMakeReservations: true,
  })

const adminToken = tokenFor('k1mnimda', [MIKPermissions.INVENTORY_ADMIN])
const userToken = tokenFor('Matti1', [MIKPermissions.INVENTORY_USER])
const noPermissionToken = tokenFor('Liisa1', [])

const created: string[] = []

const createUnit = async (body: Record<string, unknown>, cookie = adminToken) => {
  const response = await request(app)
    .post('/inventory/items/INV_O2/units')
    .set('Cookie', `accessToken=${cookie}`)
    .send(body)

  if (response.body?.unitId) created.push(response.body.unitId)
  return response
}

afterEach(async () => {
  if (created.length === 0) return
  await db.deleteFrom('inventory.itemUnits').where('unitId', 'in', created.splice(0)).execute()
})

describe('GET /inventory/items/:id/units', () => {
  it('lists an item’s units with the count that holds capacity', async () => {
    const response = await request(app)
      .get('/inventory/items/INV_VEST/units')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.inServiceCount).toBe(4)
    expect(response.body.units.map((u: { unitId: string }) => u.unitId)).toEqual(
      expect.arrayContaining(['VEST1', 'VEST5', 'VEST6']),
    )
  })

  it('hides retired units from a plain member', async () => {
    const response = await request(app)
      .get('/inventory/items/INV_VEST/units')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(200)
    const ids = response.body.units.map((u: { unitId: string }) => u.unitId)
    expect(ids).not.toContain('VEST6')
    expect(ids).toContain('VEST1')
    // The count is the club's real capacity either way — it is what the member
    // is about to be told they can reserve.
    expect(response.body.inServiceCount).toBe(4)
  })

  it('404s for an unknown item', async () => {
    const response = await request(app)
      .get('/inventory/items/nope/units')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(response.status).toBe(404)
  })

  it('is closed to a member with no inventory permission', async () => {
    const response = await request(app)
      .get('/inventory/items/INV_VEST/units')
      .set('Cookie', `accessToken=${noPermissionToken}`)

    expect(response.status).toBe(403)
  })
})

describe('POST /inventory/items/:id/units', () => {
  it('creates a unit, which starts available', async () => {
    const response = await createUnit({ tag: 'OX-NEW', condition: 'GOOD' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      itemId: 'INV_O2',
      tag: 'OX-NEW',
      status: 'AVAILABLE',
      condition: 'GOOD',
      isActive: true,
    })
  })

  it('takes the item from the path, not the body', async () => {
    const response = await createUnit({ tag: 'OX-NEW', itemId: 'INV_VEST' })

    expect(response.status).toBe(201)
    expect(response.body.itemId).toBe('INV_O2')
  })

  it('409s on a tag another unit of the item already has', async () => {
    await createUnit({ tag: 'OX-DUP' })
    const response = await createUnit({ tag: 'OX-DUP' })

    expect(response.status).toBe(409)
    expect(response.body.detail).toContain('already has that tag')
  })

  it('lets the same tag exist under a different item', async () => {
    const response = await request(app)
      .post('/inventory/items/INV_VEST/units')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ tag: 'OX-A' })

    if (response.body?.unitId) created.push(response.body.unitId)
    expect(response.status).toBe(201)
  })

  it('rejects a status supplied at creation', async () => {
    const response = await createUnit({ tag: 'OX-NEW', status: 'LOST' })
    expect(response.status).toBe(400)
  })

  it('404s for an unknown item', async () => {
    const response = await request(app)
      .post('/inventory/items/nope/units')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ tag: 'OX-NEW' })

    expect(response.status).toBe(404)
  })

  it('is closed to a plain member', async () => {
    const response = await createUnit({ tag: 'OX-NEW' }, userToken)
    expect(response.status).toBe(403)
  })
})

describe('PUT /inventory/units/:unitId', () => {
  it('patches the fields it was given and leaves the rest', async () => {
    const { body: unit } = await createUnit({ tag: 'OX-NEW', condition: 'GOOD' })

    const response = await request(app)
      .put(`/inventory/units/${unit.unitId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ notes: 'Hydro test due 2027' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      tag: 'OX-NEW',
      condition: 'GOOD',
      notes: 'Hydro test due 2027',
    })
  })

  it('retires a unit without deleting its history', async () => {
    const { body: unit } = await createUnit({ tag: 'OX-NEW' })

    const response = await request(app)
      .put(`/inventory/units/${unit.unitId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ isActive: false })

    expect(response.status).toBe(200)
    expect(response.body.isActive).toBe(false)
  })

  it('404s for an unknown unit', async () => {
    const response = await request(app)
      .put('/inventory/units/nope')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ notes: 'x' })

    expect(response.status).toBe(404)
  })

  it('is closed to a plain member', async () => {
    const { body: unit } = await createUnit({ tag: 'OX-NEW' })

    const response = await request(app)
      .put(`/inventory/units/${unit.unitId}`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ notes: 'x' })

    expect(response.status).toBe(403)
  })
})

describe('POST /inventory/units/:unitId/status', () => {
  it('moves a unit out of service, which shrinks the capacity count', async () => {
    const { body: unit } = await createUnit({ tag: 'OX-NEW' })

    const response = await request(app)
      .post(`/inventory/units/${unit.unitId}/status`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ status: 'MAINTENANCE', notes: 'Valve leaking' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('MAINTENANCE')

    const units = await request(app)
      .get('/inventory/items/INV_O2/units')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(units.body.inServiceCount).toBe(2)
  })

  it('rejects a status that is not one of the six', async () => {
    const { body: unit } = await createUnit({ tag: 'OX-NEW' })

    const response = await request(app)
      .post(`/inventory/units/${unit.unitId}/status`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ status: 'BROKEN' })

    expect(response.status).toBe(400)
  })

  it('404s for an unknown unit', async () => {
    const response = await request(app)
      .post('/inventory/units/nope/status')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ status: 'LOST' })

    expect(response.status).toBe(404)
  })

  it('is closed to a plain member', async () => {
    const { body: unit } = await createUnit({ tag: 'OX-NEW' })

    const response = await request(app)
      .post(`/inventory/units/${unit.unitId}/status`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ status: 'LOST' })

    expect(response.status).toBe(403)
  })
})
