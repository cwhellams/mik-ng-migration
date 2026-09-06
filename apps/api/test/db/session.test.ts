import { sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'

import { runWithContext } from '../../src/context'
import type { Env } from '../../src/env'
import { closeDbSession, getDb, openDbSession, withTransaction } from '../../src/db/session'
import type { DbSession } from '../../src/db/session'

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? 'postgres://admin:password@127.0.0.1:5432/mik_ng'

const pending: Promise<unknown>[] = []

const context = () => ({
  env: {
    LEGACY_ORIGIN: 'https://legacy.example.test',
    HYPERDRIVE: { connectionString: CONNECTION },
  } as unknown as Env,
  // Real Workers close the client out of band. Collect the promises so the
  // suite can await them rather than leaving sockets open.
  ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext,
})

/** Runs `fn` inside a request context with an open database session. */
const inRequest = <T>(fn: (session: DbSession) => Promise<T>, commit = true): Promise<T> =>
  runWithContext(context(), async () => {
    const session = await openDbSession()
    try {
      return await fn(session)
    } finally {
      await closeDbSession(session, commit)
    }
  })

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

describe('the request-wide transaction', () => {
  it('runs queries inside a transaction, not in autocommit', async () => {
    // Everything below depends on this being true: transaction-local settings
    // mean nothing outside a transaction.
    const inside = await inRequest(async () => {
      const res = await sql<{ t: string | null }>`
        select pg_current_xact_id_if_assigned()::text as t, txid_current_if_assigned() is not null as x
      `.execute(getDb())
      return res.rows.length === 1
    })
    expect(inside).toBe(true)
  })

  it('sets the timezone per transaction, since Hyperdrive drops libpq options', async () => {
    // The Express backend passes `options: '-c timezone=UTC'` at connection
    // time. Hyperdrive does not forward startup parameters, so this is the only
    // thing standing between the app and the origin's default timezone.
    const tz = await inRequest(async () => {
      const res = await sql<{ tz: string }>`select current_setting('TimeZone') as tz`.execute(
        getDb(),
      )
      return res.rows[0].tz
    })
    expect(tz).toBe('UTC')
  })

  it('does not leak a transaction-local setting to the next request', async () => {
    // This is the whole reason reads run in a transaction. Hyperdrive
    // multiplexes client connections onto shared origin ones, so a session-level
    // setting could be read by another request — which for app.tenant_id would
    // be a cross-tenant data leak.
    await inRequest(async () => {
      await sql`select set_config('app.tenant_id', 'tenant-a', true)`.execute(getDb())
      const res = await sql<{ v: string }>`
        select current_setting('app.tenant_id', true) as v
      `.execute(getDb())
      expect(res.rows[0].v).toBe('tenant-a')
    })

    const afterwards = await inRequest(async () => {
      const res = await sql<{ v: string | null }>`
        select current_setting('app.tenant_id', true) as v
      `.execute(getDb())
      return res.rows[0].v
    })
    expect(afterwards === null || afterwards === '').toBe(true)
  })

  it('rolls the whole request back when it is closed with commit=false', async () => {
    const table = `mik_test_${Date.now()}`
    await inRequest(async () => {
      await sql.raw(`create table ${table} (id int)`).execute(getDb())
      await sql.raw(`insert into ${table} values (1)`).execute(getDb())
    }, false)

    const exists = await inRequest(async () => {
      const res = await sql<{ ok: boolean }>`
        select to_regclass(${table}) is not null as ok
      `.execute(getDb())
      return res.rows[0].ok
    })
    expect(exists).toBe(false)
  })
})

describe('withTransaction, the replacement for db.transaction()', () => {
  it('rolls back only its own work when it throws', async () => {
    const table = `mik_test_${Date.now()}_a`
    const survived = await inRequest(async () => {
      await sql.raw(`create temp table ${table} (id int)`).execute(getDb())
      await sql.raw(`insert into ${table} values (1)`).execute(getDb())

      await expect(
        withTransaction(async (trx) => {
          await sql.raw(`insert into ${table} values (2)`).execute(trx)
          throw new Error('inner failure')
        }),
      ).rejects.toThrow('inner failure')

      const res = await sql
        .raw<{ id: number }>(`select id from ${table} order by id`)
        .execute(getDb())
      return res.rows.map((r) => r.id)
    }, false)

    expect(survived).toEqual([1])
  })

  it('leaves the request usable after a database error inside it', async () => {
    // The case savepoints exist for. Postgres marks a whole transaction aborted
    // after any error, so without a savepoint the first caught constraint
    // violation would make every later statement fail with "current transaction
    // is aborted" — breaking code that today catches and carries on.
    const after = await inRequest(async () => {
      await expect(
        withTransaction(async (trx) => {
          await sql`select 1 / 0`.execute(trx)
        }),
      ).rejects.toThrow()

      const res = await sql<{ n: number }>`select 42 as n`.execute(getDb())
      return res.rows[0].n
    }, false)

    expect(after).toBe(42)
  })

  it('keeps its work when it succeeds', async () => {
    const table = `mik_test_${Date.now()}_b`
    const rows = await inRequest(async () => {
      await sql.raw(`create temp table ${table} (id int)`).execute(getDb())
      await withTransaction(async (trx) => {
        await sql.raw(`insert into ${table} values (7)`).execute(trx)
      })
      const res = await sql.raw<{ id: number }>(`select id from ${table}`).execute(getDb())
      return res.rows.map((r) => r.id)
    }, false)

    expect(rows).toEqual([7])
  })

  it('nests', async () => {
    const table = `mik_test_${Date.now()}_c`
    const rows = await inRequest(async () => {
      await sql.raw(`create temp table ${table} (id int)`).execute(getDb())
      await withTransaction(async () => {
        await sql.raw(`insert into ${table} values (1)`).execute(getDb())
        await expect(
          withTransaction(async (inner) => {
            await sql.raw(`insert into ${table} values (2)`).execute(inner)
            throw new Error('deeper failure')
          }),
        ).rejects.toThrow('deeper failure')
      })
      const res = await sql.raw<{ id: number }>(`select id from ${table}`).execute(getDb())
      return res.rows.map((r) => r.id)
    }, false)

    expect(rows).toEqual([1])
  })
})

describe('getDb outside a request', () => {
  it('throws rather than handing back a connectionless handle', async () => {
    await runWithContext(context(), async () => {
      expect(() => getDb()).toThrow(/No database for this request/)
    })
  })
})
