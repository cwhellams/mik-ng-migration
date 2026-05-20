import {
  getPostgreSQLEventStore,
  type PostgresEventStore,
} from '@event-driven-io/emmett-postgresql'
import { pool } from '../db/connection.ts'
import logger from './logger.ts'

let _eventStore: PostgresEventStore | null = null

/**
 * Returns the shared PostgreSQL event store singleton.
 * Schema migration is disabled — Flyway manages the emt_* tables.
 * Uses the shared pg.Pool from connection.ts so SSL config is inherited.
 */
export function getEventStore(): PostgresEventStore {
  if (!_eventStore) {
    logger.info('Initializing PostgreSQL event store (schema migration delegated to Flyway)')
    _eventStore = getPostgreSQLEventStore(process.env.DATABASE_URL ?? '', {
      schema: { autoMigration: 'None' },
      connectionOptions: { pool },
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
