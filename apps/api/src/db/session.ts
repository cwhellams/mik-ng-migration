import type { ControlledTransaction, Kysely, Transaction } from 'kysely'
import { sql } from 'kysely'
import type pg from 'pg'

import type { DB } from '@mik/db-schema/schema'

import { getContext } from '../context'
import { createClient, createDb } from './connection'

/**
 * The database for the current request: one client, and one transaction that
 * spans the whole request.
 *
 * **Everything runs inside that transaction, reads included**, and that is the
 * point rather than an accident:
 *
 *   - Hyperdrive multiplexes client connections onto a smaller set of origin
 *     ones, so anything set at *session* scope can be seen by another request.
 *     `SET app.tenant_id` there would be a cross-tenant data leak. Set
 *     transaction-locally (`set_config(..., true)`) it cannot outlive the
 *     transaction that set it.
 *   - The Express backend passes `options: '-c timezone=UTC'` as a libpq
 *     startup parameter. Hyperdrive does not forward those, so the timezone has
 *     to be set per transaction instead — and it must be, because the origin's
 *     default is whatever the provider chose.
 *
 * A read-only request pays a `begin`/`commit` for this. That is cheap, and much
 * cheaper than the alternatives are correct.
 */
export interface DbSession {
  client: pg.Client
  db: Kysely<DB>
  trx: ControlledTransaction<DB>
}

const sessions = new WeakMap<object, DbSession>()

/**
 * Opens the connection and the request-wide transaction.
 *
 * The client is closed through `ctx.waitUntil()` rather than awaited inline, so
 * the response is not held up by a socket teardown.
 */
export const openDbSession = async (): Promise<DbSession> => {
  const { env } = getContext()
  const client = createClient(env.HYPERDRIVE.connectionString)
  await client.connect()

  const db = createDb(client)
  const trx = await db.startTransaction().execute()

  await sql`set local time zone 'UTC'`.execute(trx)

  const session: DbSession = { client, db, trx }
  sessions.set(getContext(), session)
  return session
}

export const closeDbSession = async (session: DbSession, commit: boolean): Promise<void> => {
  try {
    await (commit ? session.trx.commit() : session.trx.rollback()).execute()
  } finally {
    const { ctx } = getContext()
    ctx.waitUntil(session.client.end())
  }
}

/**
 * The database handle for the current request.
 *
 * It is the request-wide transaction, not a pool-backed `Kysely`. Ported query
 * modules take it in place of the `db` singleton they import today.
 */
export const getDb = (): Transaction<DB> => {
  const session = sessions.get(getContext())
  if (!session) {
    throw new Error(
      'No database for this request. getDb() is only valid inside a handler that ran ' +
        'the database middleware — background work (cron, queue consumers) opens its ' +
        'own session instead.',
    )
  }
  return session.trx
}

let savepointCounter = 0

/**
 * The replacement for `db.transaction().execute(fn)`.
 *
 * Every one of the backend's 65 `db.transaction()` call sites has to become
 * this, because the request is already inside a transaction and Kysely refuses
 * to nest one — it throws `calling the transaction method for a Transaction is
 * not supported`. That is a good failure: loud, and at the call site.
 *
 * It is a **savepoint**, not a no-op, and the difference matters. Postgres
 * marks a whole transaction aborted after any error in it, so without a
 * savepoint the first caught database error would poison the rest of the
 * request: code that today catches a constraint violation and carries on would
 * find every subsequent statement failing with `current transaction is
 * aborted`. Rolling back to a savepoint clears that.
 *
 * One difference from the Express behaviour remains, and it is deliberate:
 * there, a committed inner transaction survives a later failure elsewhere in
 * the request. Here the outer transaction owns the commit, so it does not. A
 * request that fails now leaves nothing behind, which is the safer of the two
 * and the one the tenancy work in phase 7 wants anyway.
 */
export const withTransaction = async <T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> => {
  const session = sessions.get(getContext())
  if (!session) throw new Error('withTransaction() needs a database session; see getDb().')

  const name = `mik_sp_${++savepointCounter}`
  const sp = await session.trx.savepoint(name).execute()
  try {
    const result = await fn(sp as unknown as Transaction<DB>)
    await sp.releaseSavepoint(name).execute()
    return result
  } catch (error) {
    await sp.rollbackToSavepoint(name).execute()
    throw error
  }
}
