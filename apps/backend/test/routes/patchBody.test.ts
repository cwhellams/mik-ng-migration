import { z } from 'zod'

import { onlySent } from '../../src/routes/patchBody.ts'

/**
 * `onlySent` exists because of one Zod behaviour, so the first case states it:
 * `.partial()` makes a defaulted field optional to *send* and still fills the
 * default in, which is indistinguishable downstream from the caller having
 * asked for it (#1139 review).
 */
const Schema = z.object({
  name: z.string().optional(),
  quantity: z.number().default(1),
  isReservable: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
})

describe('onlySent', () => {
  it('is needed at all: Zod re-applies defaults under .partial()', () => {
    expect(Schema.partial().parse({ name: 'Life Vest' })).toEqual({
      name: 'Life Vest',
      quantity: 1,
      isReservable: false,
      tags: [],
    })
  })

  it('keeps only the keys the body carried', () => {
    const body = { name: 'Life Vest' }

    expect(onlySent(Schema.partial().parse(body), body)).toEqual({ name: 'Life Vest' })
  })

  it('keeps a defaulted field the caller did send, default value and all', () => {
    const body = { quantity: 1, isReservable: false }

    expect(onlySent(Schema.partial().parse(body), body)).toEqual({
      quantity: 1,
      isReservable: false,
    })
  })

  it('keeps an explicit null, which is a value and not an absence', () => {
    const body = { name: null }

    // Parsed through a schema that allows it, so the null survives to the patch
    // — "clear this field" has to stay distinguishable from "leave it alone".
    const parsed = z.object({ name: z.string().nullable() }).partial().parse(body)
    expect(onlySent(parsed, body)).toEqual({ name: null })
  })

  it('returns nothing for an empty body, however many defaults the schema has', () => {
    expect(onlySent(Schema.partial().parse({}), {})).toEqual({})
  })

  it('treats a missing or non-object body as having sent nothing', () => {
    const parsed = Schema.partial().parse({})

    expect(onlySent(parsed, undefined)).toEqual({})
    expect(onlySent(parsed, null)).toEqual({})
    expect(onlySent(parsed, 'not an object')).toEqual({})
  })
})
