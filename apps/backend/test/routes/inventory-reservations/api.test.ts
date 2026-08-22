/**
 * The item reservation endpoints (#1139).
 *
 * `sendEmail` is mocked with `jest.unstable_mockModule` — and every dependent
 * module therefore imported dynamically — both so the suite sends no mail and so
 * the notification assertions can name the template that went out. Same pattern
 * as `bookings/api-instructor-notification.test.ts`.
 *
 * The identity triad is the point of most of what follows: a reservation admin,
 * an ordinary member, and a member holding no reservation permission at all.
 */

import { jest, afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals'

import 'dotenv/config'

import type { sendEmail } from '../../../src/lib/sendGmail.ts'

const mockSendEmail = jest.fn<typeof sendEmail>()
jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

const { default: express } = await import('express')
const { default: cookieParser } = await import('cookie-parser')
const { default: request } = await import('supertest')
const { default: dayjs } = await import('dayjs')

const { default: reservationsRouter } =
  await import('../../../src/routes/inventory-reservations/api.ts')
const { generateAccessToken } = await import('../../../src/routes/auth/token.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { MIKPermissions } = await import('@mik/contracts/members')
const { ItemReservationStatus } = await import('@mik/contracts/inventory-reservations')
const { db } = await import('../../../src/db/connection.ts')
const { getMemberById } = await import('../../../src/db/member-queries.ts')
const { emailTemplates } = await import('../../../src/templates/registry.ts')
const { normaliseEmailLang } = await import('../../../src/templates/renderEmail.ts')

type ItemReservationUpsertRequest =
  import('@mik/contracts/inventory-reservations').ItemReservationUpsertRequest

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/inventory-reservations', reservationsRouter)
app.use(problemErrorHandler)

const token = (
  memberId: string,
  permissions: (typeof MIKPermissions)[keyof typeof MIKPermissions][],
  canMakeReservations = true,
) =>
  generateAccessToken({
    memberId,
    lastName: 'Test',
    email: `${memberId}@mik.fi`,
    roles: [],
    permissions,
    canMakeReservations,
  })

const adminToken = token('k1mnimda', [MIKPermissions.INVENTORY_RESERVATION_ADMIN])
const userToken = token('Matti1', [MIKPermissions.INVENTORY_RESERVATION_USER])
const otherUserToken = token('Liisa1', [MIKPermissions.INVENTORY_RESERVATION_USER])
const suspendedToken = token('Matti1', [MIKPermissions.INVENTORY_RESERVATION_USER], false)
const noPermissionToken = token('Kaisa1', [])

/** A window far enough out that nothing seeded overlaps it. */
const slot = (dayOffset: number, hours = 2) => {
  const start = dayjs().add(dayOffset, 'day').startOf('hour')
  return {
    startTimeEpoch: start.unix().toString(),
    endTimeEpoch: start.add(hours, 'hour').unix().toString(),
  }
}

const draft = (
  overrides: Partial<ItemReservationUpsertRequest> = {},
): ItemReservationUpsertRequest => ({
  memberId: 'Matti1',
  itemId: 'INV_VEST',
  unitId: null,
  quantity: 1,
  linkedBookingId: null,
  status: ItemReservationStatus.CONFIRMED,
  description: undefined,
  ...slot(60),
  ...overrides,
})

/**
 * The subject a member would actually receive, looked up the way
 * `renderEmail()` does rather than hard-coded: the seeded cast is Finnish, and
 * an assertion pinned to English would pass only by accident.
 */
const expectedSubject = async (
  key: 'item-reservation-confirmed' | 'item-reservation-updated' | 'item-reservation-cancelled',
  memberId: string,
  itemName: { en: string; fi: string; sv: string },
) => {
  const member = await getMemberById(memberId)
  const lang = normaliseEmailLang(member?.lang)
  return emailTemplates[key].subject[lang].replace('{{itemName}}', itemName[lang])
}

const LIFE_VEST = { en: 'Life Vest', fi: 'Pelastusliivi', sv: 'Flytväst' }

/**
 * The routes fire their notification without awaiting it, so delivery can't
 * hold up the response. That makes the mock's call list a race against the
 * supertest round trip; poll for it rather than assuming it has landed.
 */
const awaitEmails = async (count: number) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (mockSendEmail.mock.calls.length >= count) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const created: string[] = []

const post = async (body: ItemReservationUpsertRequest, cookie = userToken) => {
  const response = await request(app)
    .post('/inventory-reservations')
    .set('Cookie', `accessToken=${cookie}`)
    .send(body)

  if (response.body?.reservationId) created.push(response.body.reservationId)
  return response
}

beforeEach(() => {
  mockSendEmail.mockClear()
})

afterEach(async () => {
  if (created.length === 0) return
  await db
    .deleteFrom('inventory.reservations')
    .where('reservationId', 'in', created.splice(0))
    .execute()
})

afterAll(async () => {
  await db.deleteFrom('inventory.reservations').where('reservationId', 'like', 'test%').execute()
})

describe('POST /inventory-reservations', () => {
  it('creates a reservation for the caller and emails them', async () => {
    const response = await post(draft())

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      memberId: 'Matti1',
      itemId: 'INV_VEST',
      quantity: 1,
      status: ItemReservationStatus.CONFIRMED,
      itemName: { en: 'Life Vest' },
    })

    await awaitEmails(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      await expectedSubject('item-reservation-confirmed', 'Matti1', LIFE_VEST),
      expect.stringContaining('Pelastusliivi'),
    )
  })

  it('lets an admin reserve on another member’s behalf', async () => {
    const response = await post(draft({ memberId: 'Liisa1' }), adminToken)

    expect(response.status).toBe(201)
    expect(response.body.memberId).toBe('Liisa1')
  })

  it('refuses to let a member reserve for someone else', async () => {
    const response = await post(draft({ memberId: 'Liisa1' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('Invalid member id')
  })

  it('refuses a member whose reservation rights are suspended', async () => {
    const response = await post(draft(), suspendedToken)

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('Reservations suspended')
  })

  it('is closed to a member with no reservation permission', async () => {
    const response = await post(draft(), noPermissionToken)
    expect(response.status).toBe(403)
  })

  it('rejects an item that is not marked reservable', async () => {
    const response = await post(draft({ itemId: 'INV_PAPER' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('This item cannot be reserved')
  })

  it('rejects an item that does not exist', async () => {
    const response = await post(draft({ itemId: 'nope' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toContain('does not exist')
  })

  it('rejects a unit belonging to a different item', async () => {
    const response = await post(draft({ itemId: 'INV_O2', unitId: 'VEST1' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('Unit does not belong to this item')
  })

  it('rejects a retired unit', async () => {
    const response = await post(draft({ unitId: 'VEST6' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('This unit has been retired')
  })

  it('rejects a unit that is out of service though its row is still active', async () => {
    // VEST5 is in MAINTENANCE with is_active TRUE — the gap `isActive` alone
    // leaves open. `in_service_unit_count()` does not count it, so reserving it
    // would promise a vest the club cannot hand over *and* escape the capacity
    // check, which measures against a pool that excludes it.
    const response = await post(draft({ unitId: 'VEST5' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('This unit is not in service')
  })

  it('rejects a linked booking that does not exist', async () => {
    const response = await post(draft({ linkedBookingId: 'nope' }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toContain('does not exist')
  })

  it('accepts a link to a real flight booking', async () => {
    // `resvbk1` rather than one of the seeded `stl%` flights — see V300: those
    // are scratch space two worker suites hard-delete rows from.
    const response = await post(draft({ linkedBookingId: 'resvbk1' }))

    expect(response.status).toBe(201)
    expect(response.body.linkedBookingId).toBe('resvbk1')
  })

  it('says how many units are free when the window is full', async () => {
    const window = slot(61)
    await post(draft({ ...window, quantity: 4 }))

    const response = await post(draft({ ...window, quantity: 2 }))

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('Only 0 of 4 units are free for that time')
  })

  it('rejects a quantity of zero at the schema, not the trigger', async () => {
    const response = await post(draft({ quantity: 0 }))
    expect(response.status).toBe(400)
  })

  it('rejects a window that ends before it starts', async () => {
    const window = slot(62)
    const response = await post(
      draft({ startTimeEpoch: window.endTimeEpoch, endTimeEpoch: window.startTimeEpoch }),
    )

    expect(response.status).toBe(400)
  })

  it('rejects a specific-unit reservation asking for more than one unit', async () => {
    const response = await post(draft({ unitId: 'VEST1', quantity: 2 }))
    expect(response.status).toBe(400)
  })
})

describe('GET /inventory-reservations', () => {
  it('shows the whole shared calendar to any member', async () => {
    const response = await request(app)
      .get('/inventory-reservations')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(200)
    const ids = response.body.reservations.map((r: { reservationId: string }) => r.reservationId)
    expect(ids).toEqual(expect.arrayContaining(['resv1', 'resv2']))
  })

  it('lets a member filter to their own reservations', async () => {
    const response = await request(app)
      .get('/inventory-reservations')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ memberId: 'Matti1' })

    expect(response.status).toBe(200)
    expect(
      response.body.reservations.every((r: { memberId: string }) => r.memberId === 'Matti1'),
    ).toBe(true)
  })

  it('refuses to single out another member’s reservations', async () => {
    const response = await request(app)
      .get('/inventory-reservations')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ memberId: 'Liisa1' })

    expect(response.status).toBe(403)
  })

  it('lets an admin filter by any member', async () => {
    const response = await request(app)
      .get('/inventory-reservations')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ memberId: 'Liisa1' })

    expect(response.status).toBe(200)
  })

  it('rejects an unknown filter rather than ignoring it', async () => {
    const response = await request(app)
      .get('/inventory-reservations')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ nonsense: 'true' })

    expect(response.status).toBe(400)
  })

  it('is closed to a member with no reservation permission', async () => {
    const response = await request(app)
      .get('/inventory-reservations')
      .set('Cookie', `accessToken=${noPermissionToken}`)

    expect(response.status).toBe(403)
  })
})

describe('GET /inventory-reservations/:id', () => {
  it('returns a reservation', async () => {
    const response = await request(app)
      .get('/inventory-reservations/resv2')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ reservationId: 'resv2', unitTag: 'OX-A' })
  })

  it('404s for an unknown id', async () => {
    const response = await request(app)
      .get('/inventory-reservations/nope')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(404)
  })
})

describe('PATCH /inventory-reservations/:id', () => {
  it('moves the caller’s own reservation and emails them', async () => {
    const { body } = await post(draft())
    const moved = slot(63)

    const response = await request(app)
      .patch(`/inventory-reservations/${body.reservationId}`)
      .set('Cookie', `accessToken=${userToken}`)
      .send(moved)

    expect(response.status).toBe(200)
    expect(response.body.startTimeEpoch).toBe(moved.startTimeEpoch)
    await awaitEmails(2)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      await expectedSubject('item-reservation-updated', 'Matti1', LIFE_VEST),
      expect.any(String),
    )
  })

  it('refuses to patch another member’s reservation', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .patch(`/inventory-reservations/${body.reservationId}`)
      .set('Cookie', `accessToken=${otherUserToken}`)
      .send({ quantity: 2 })

    expect(response.status).toBe(403)
  })

  it('lets an admin patch anyone’s reservation', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .patch(`/inventory-reservations/${body.reservationId}`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ quantity: 2 })

    expect(response.status).toBe(200)
    expect(response.body.quantity).toBe(2)
  })

  it('checks capacity against the merged reservation, not just the patch', async () => {
    const window = slot(64)
    await post(draft({ ...window, quantity: 3 }))
    const { body } = await post(draft({ ...window, quantity: 1 }))

    // Only the quantity is in the body; the item and window come from the
    // stored row, and together they no longer fit.
    const response = await request(app)
      .patch(`/inventory-reservations/${body.reservationId}`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ quantity: 2 })

    expect(response.status).toBe(400)
    expect(response.body.detail).toContain('units are free for that time')
  })

  it('404s for an unknown reservation', async () => {
    const response = await request(app)
      .patch('/inventory-reservations/nope')
      .set('Cookie', `accessToken=${userToken}`)
      .send({ quantity: 1 })

    expect(response.status).toBe(404)
  })

  it('still cancels a reservation whose unit has left service since', async () => {
    const { body } = await post(draft({ unitId: 'VEST1' }))

    // The vest is discovered to be broken after it was reserved. A cancelled
    // reservation holds nothing, so the in-service rule must not be what stands
    // between the member and giving it back.
    await db
      .updateTable('inventory.itemUnits')
      .set({ status: 'MAINTENANCE' })
      .where('unitId', '=', 'VEST1')
      .execute()

    try {
      const response = await request(app)
        .patch(`/inventory-reservations/${body.reservationId}`)
        .set('Cookie', `accessToken=${userToken}`)
        .send({ status: ItemReservationStatus.CANCELLED })

      expect(response.status).toBe(200)
      expect(response.body.status).toBe(ItemReservationStatus.CANCELLED)
    } finally {
      await db
        .updateTable('inventory.itemUnits')
        .set({ status: 'AVAILABLE' })
        .where('unitId', '=', 'VEST1')
        .execute()
    }
  })

  it('emails a cancellation, not an update, when the patch cancels', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .patch(`/inventory-reservations/${body.reservationId}`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ status: ItemReservationStatus.CANCELLED })

    expect(response.status).toBe(200)
    await awaitEmails(2)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      await expectedSubject('item-reservation-cancelled', 'Matti1', LIFE_VEST),
      expect.any(String),
    )
  })
})

describe('POST /inventory-reservations/:id/cancel', () => {
  it('cancels the caller’s own reservation, keeping the note, and emails them', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ note: 'Weather' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: ItemReservationStatus.CANCELLED,
      cancelledBy: 'Matti1',
      cancellationNote: 'Weather',
    })
    await awaitEmails(2)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      await expectedSubject('item-reservation-cancelled', 'Matti1', LIFE_VEST),
      expect.stringContaining('Weather'),
    )
  })

  it('frees the capacity it was holding', async () => {
    const window = slot(65)
    const { body } = await post(draft({ ...window, quantity: 4 }))

    await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({})

    const replacement = await post(draft({ ...window, quantity: 4 }))
    expect(replacement.status).toBe(201)
  })

  it('lets an admin cancel a member’s reservation, notifying the member', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ note: 'Vests recalled for inspection' })

    expect(response.status).toBe(200)
    expect(response.body.cancelledBy).toBe('k1mnimda')
    // The member, not the admin who cancelled, is the one who needs to know.
    await awaitEmails(2)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      await expectedSubject('item-reservation-cancelled', 'Matti1', LIFE_VEST),
      expect.stringContaining('Vests recalled for inspection'),
    )
  })

  it('refuses to cancel another member’s reservation', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${otherUserToken}`)
      .send({})

    expect(response.status).toBe(403)
  })

  it('409s on a second cancellation', async () => {
    const { body } = await post(draft())

    await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({})

    const response = await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({})

    expect(response.status).toBe(409)
  })

  it('404s for an unknown reservation', async () => {
    const response = await request(app)
      .post('/inventory-reservations/nope/cancel')
      .set('Cookie', `accessToken=${userToken}`)
      .send({})

    expect(response.status).toBe(404)
  })

  it('rejects a note longer than the column allows', async () => {
    const { body } = await post(draft())

    const response = await request(app)
      .post(`/inventory-reservations/${body.reservationId}/cancel`)
      .set('Cookie', `accessToken=${userToken}`)
      .send({ note: 'x'.repeat(501) })

    expect(response.status).toBe(400)
  })
})
