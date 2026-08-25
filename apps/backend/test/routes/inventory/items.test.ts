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
 * `PUT /inventory/items/:id` as a *patch* (#1139 review).
 *
 * The route parses its body with `InventoryItemUpsertSchema.partial()`, and Zod
 * re-applies a field's `.default()` even under `.partial()` — so every defaulted
 * field arrived asserting its default whether the caller had mentioned it or
 * not, and `upsertItem` writes whatever is defined. Ticking an item reservable
 * and then correcting its name over the API would have un-reserved it again.
 *
 * `isReservable` is the field this PR added; the others were already exposed and
 * are asserted here because they fail in exactly the same way.
 */

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/inventory', inventoryRouter)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Test',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.INVENTORY_ADMIN],
  canMakeReservations: true,
})

const created: string[] = []

const createItem = async (body: Record<string, unknown> = {}) => {
  const response = await request(app)
    .post('/inventory/items')
    .set('Cookie', `accessToken=${adminToken}`)
    .send({
      categoryId: 'INV_OTHER',
      name: { en: 'Tow Bar', fi: 'Vetoaisa', sv: 'Bogserstång' },
      itemType: 'ASSET',
      condition: 'GOOD',
      tags: ['ground-equipment'],
      isReservable: true,
      ...body,
    })

  if (response.body?.itemId) created.push(response.body.itemId)
  return response
}

const put = (itemId: string, body: Record<string, unknown>) =>
  request(app)
    .put(`/inventory/items/${itemId}`)
    .set('Cookie', `accessToken=${adminToken}`)
    .send(body)

afterEach(async () => {
  if (created.length === 0) return
  const ids = created.splice(0)
  // The audit trail points at the item, so it goes first.
  await db.deleteFrom('inventory.auditLog').where('itemId', 'in', ids).execute()
  await db.deleteFrom('inventory.items').where('itemId', 'in', ids).execute()
})

describe('PUT /inventory/items/:id', () => {
  it('leaves a reservable item reservable when the body does not mention it', async () => {
    const { body: item } = await createItem()
    expect(item.isReservable).toBe(true)

    const response = await put(item.itemId, {
      name: { en: 'Tow Bar (long)', fi: 'Vetoaisa (pitkä)', sv: 'Bogserstång (lång)' },
    })

    expect(response.status).toBe(200)
    expect(response.body.isReservable).toBe(true)
    expect(response.body.name.en).toBe('Tow Bar (long)')
  })

  it('leaves itemType, condition, tags and isActive alone too', async () => {
    const { body: item } = await createItem()

    const response = await put(item.itemId, { notes: 'Stored behind the fuel pump' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      itemType: 'ASSET',
      condition: 'GOOD',
      tags: ['ground-equipment'],
      isActive: true,
      notes: 'Stored behind the fuel pump',
    })
  })

  it('does not un-retire an item that a later PUT never mentions', async () => {
    const { body: item } = await createItem()
    await request(app)
      .delete(`/inventory/items/${item.itemId}`)
      .set('Cookie', `accessToken=${adminToken}`)

    const response = await put(item.itemId, { notes: 'Found in the hangar' })

    expect(response.status).toBe(200)
    expect(response.body.isActive).toBe(false)
  })

  it('still applies a field the caller did send', async () => {
    const { body: item } = await createItem()

    const response = await put(item.itemId, { isReservable: false, condition: 'POOR' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ isReservable: false, condition: 'POOR' })
  })

  it('404s for an unknown item', async () => {
    const response = await put('nope', { notes: 'x' })
    expect(response.status).toBe(404)
  })
})
