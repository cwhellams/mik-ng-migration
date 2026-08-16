import { describe, expect, it } from '@jest/globals'

import { AuditableSchema } from '@mik/contracts/schema'

import { auditCreate, auditUpdate, mapAudit } from '../../src/db/audit.ts'

describe('audit helpers', () => {
  const jwt = { memberId: 'Matti1', lastName: 'T', email: 'e', roles: [], permissions: [] }

  describe('auditCreate', () => {
    it('sets both halves of the quadruple from one actor', () => {
      const at = new Date('2026-01-02T03:04:05.678Z')

      expect(auditCreate(jwt, at)).toEqual({
        createdAt: at,
        createdBy: 'Matti1',
        updatedAt: at,
        updatedBy: 'Matti1',
      })
    })

    it('gives createdAt and updatedAt the identical instant', () => {
      // Not just "close": a row whose updatedAt is a millisecond past its createdAt
      // reads as edited in the change log the moment it is created.
      const row = auditCreate('Matti1')

      expect(row.updatedAt).toBe(row.createdAt)
    })

    it('accepts a bare member id as well as a user object', () => {
      const at = new Date()

      expect(auditCreate('Matti1', at)).toEqual(auditCreate(jwt, at))
    })

    it('shares one timestamp across rows written as a single action', () => {
      const at = new Date()
      const rows = [auditCreate(jwt, at), auditCreate(jwt, at), auditCreate(jwt, at)]

      expect(new Set(rows.map((r) => r.createdAt.getTime())).size).toBe(1)
    })
  })

  describe('auditUpdate', () => {
    it('sets only the updated half', () => {
      const at = new Date('2026-01-02T03:04:05.678Z')

      expect(auditUpdate(jwt, at)).toEqual({ updatedAt: at, updatedBy: 'Matti1' })
    })

    it('does not carry createdBy or createdAt', () => {
      // An update that also wrote the created_* half would rewrite who created the row,
      // which is the one thing these columns exist to preserve.
      const keys = Object.keys(auditUpdate(jwt))

      expect(keys).not.toContain('createdBy')
      expect(keys).not.toContain('createdAt')
    })
  })

  // `at` used to be a generic with a `new Date() as T` default, which let a caller
  // write auditCreate<string>(actor) and be told the timestamps were strings while the
  // runtime handed back a Date. The overloads close that; these lines fail to compile
  // if someone reopens it, because @ts-expect-error errors when there is no error.
  it('cannot be told the timestamp is a string without supplying one', () => {
    // @ts-expect-error explicit type argument requires the matching `at`
    const created = auditCreate<string>('Matti1')
    // @ts-expect-error explicit type argument requires the matching `at`
    const updated = auditUpdate<string>('Matti1')

    expect(created.createdAt).toBeInstanceOf(Date)
    expect(updated.updatedAt).toBeInstanceOf(Date)
  })

  it('keeps a supplied string a string, and a supplied Date a Date', () => {
    const iso = '2026-01-02T03:04:05.678Z'

    expect(auditCreate('Matti1', iso).createdAt).toBe(iso)
    expect(auditUpdate('Matti1', iso).updatedAt).toBe(iso)
    expect(auditCreate('Matti1', new Date(iso)).createdAt).toBeInstanceOf(Date)
  })

  describe('mapAudit', () => {
    it('serialises Date timestamps and passes the actors through', () => {
      const mapped = mapAudit({
        createdAt: new Date('2026-01-02T03:04:05.678Z'),
        createdBy: 'Matti1',
        updatedAt: new Date('2026-02-03T04:05:06.789Z'),
        updatedBy: 'Liisa1',
      })

      expect(mapped).toEqual({
        createdAt: '2026-01-02T03:04:05.678Z',
        createdBy: 'Matti1',
        updatedAt: '2026-02-03T04:05:06.789Z',
        updatedBy: 'Liisa1',
      })
    })

    it('leaves an already-ISO string identical, milliseconds included', () => {
      const mapped = mapAudit({
        createdAt: '2026-01-02T03:04:05.678Z',
        createdBy: 'Matti1',
        updatedAt: new Date('2026-02-03T04:05:06.789Z'),
        updatedBy: 'Matti1',
      })

      expect(mapped.createdAt).toBe('2026-01-02T03:04:05.678Z')
      expect(mapped.updatedAt).toBe('2026-02-03T04:05:06.789Z')
    })

    it('normalises a Postgres-style timestamp string to ISO', () => {
      // What the hand-written `instanceof Date` ternary did via new Date(...). Passing
      // this through unchanged would produce a string AuditableSchema rejects.
      const mapped = mapAudit({
        createdAt: '2026-01-02 03:04:05+00',
        createdBy: 'Matti1',
        updatedAt: '2026-01-02 03:04:05+00',
        updatedBy: 'Matti1',
      })

      expect(mapped.createdAt).toBe('2026-01-02T03:04:05.000Z')
      expect(() => AuditableSchema.parse(mapped)).not.toThrow()
    })

    it('preserves millisecond precision', () => {
      // Re-parsing through `new Date(String(...))` used to truncate these.
      const mapped = mapAudit({
        createdAt: new Date('2026-01-02T03:04:05.678Z'),
        createdBy: 'x',
        updatedAt: new Date('2026-01-02T03:04:05.001Z'),
        updatedBy: 'x',
      })

      expect(mapped.createdAt).toContain('.678')
      expect(mapped.updatedAt).toContain('.001')
    })

    it('produces something AuditableSchema accepts', () => {
      const mapped = mapAudit({
        createdAt: new Date(),
        createdBy: 'Matti1',
        updatedAt: new Date(),
        updatedBy: 'Matti1',
      })

      expect(() => AuditableSchema.parse(mapped)).not.toThrow()
    })

    it('emits exactly the four audit keys and nothing else', () => {
      // AuditableSchema is .strict(), so a stray key would be rejected wherever the
      // result is spread into a contract object.
      const mapped = mapAudit({
        createdAt: new Date(),
        createdBy: 'a',
        updatedAt: new Date(),
        updatedBy: 'b',
      })

      expect(Object.keys(mapped).sort()).toEqual([
        'createdAt',
        'createdBy',
        'updatedAt',
        'updatedBy',
      ])
    })
  })
})
