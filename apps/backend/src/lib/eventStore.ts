import {
  getPostgreSQLEventStore,
  type PostgresEventStore,
} from '@event-driven-io/emmett-postgresql'
import logger from './logger.ts'

let _eventStore: PostgresEventStore | null = null

/**
 * Returns the shared PostgreSQL event store singleton.
 * Schema migration is disabled — Flyway manages the emt_* tables.
 */
export function getEventStore(): PostgresEventStore {
  if (!_eventStore) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for the event store')
    }
    logger.info('Initializing PostgreSQL event store (schema migration delegated to Flyway)')
    _eventStore = getPostgreSQLEventStore(connectionString, {
      schema: { autoMigration: 'None' },
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
