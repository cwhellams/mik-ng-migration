import dotenv from 'dotenv'
dotenv.config()
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

import type { DB } from './schema.d.ts'
import logger from '../lib/logger.ts'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Wait for a connection for 2 seconds
})

const dialect = new PostgresDialect({
  pool,
})

// Function to close the pool
const closeDb = async (): Promise<void> => {
  await pool.end() // Close all connections in the pool
}

export const db = new Kysely<DB>({ dialect })
export { closeDb } // Export the pool for testing

logger.info('Connected to PostgreSQL!')
