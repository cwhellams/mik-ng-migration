import {
  getPostgreSQLEventStore,
  type PostgresEventStore,
} from '@event-driven-io/emmett-postgresql'
import pg from 'pg'
import { readFileSync } from 'fs'
import logger from './logger.ts'

let _eventStore: PostgresEventStore | null = null

/**
 * Returns the shared PostgreSQL event store singleton.
 * Schema migration is disabled — Flyway manages the emt_* tables.
 * Uses a dedicated pg.Pool so Emmett's internal type-parser overrides
 * (dumbo sets INT8 → BigInt globally) do not affect the Kysely pool.
 */
export function getEventStore(): PostgresEventStore {
  if (!_eventStore) {
    const useSSL = process.env.DB_SSL
    let sslConfig: pg.PoolConfig['ssl'] = undefined
    if (useSSL) {
      const certFile = process.env.DATABASE_CA_CERT_FILE || './ca-certificate.crt'
      const caCert = readFileSync(certFile, 'utf-8')
      sslConfig = { rejectUnauthorized: true, ca: caCert }
    }
    const emmettPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
    })
    logger.info('Initializing PostgreSQL event store (schema migration delegated to Flyway)')
    _eventStore = getPostgreSQLEventStore(process.env.DATABASE_URL ?? '', {
      schema: { autoMigration: 'None' },
      connectionOptions: { pool: emmettPool },
    })
  }
  return _eventStore
}

export async function closeEventStore(): Promise<void> {
  if (_eventStore) {
    await _eventStore.close()
    _eventStore = null
  }
}
