import * as fs from 'fs'

import 'dotenv/config'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

import type { DB } from './schema.d.ts'

//Digital Ocean requires SSL connection to the database with a CA Certificate also used
const useSSL = process.env.DB_SSL

// Parse dates as strings - this is necessary because the PostgreSQL driver
// returns dates as Date objects by default, which can cause issues
// due to times being included in the date with timezone conversions
// This can result in dates being off by a day when stored in the database
// and retrieved back as Date objects
pg.types.setTypeParser(pg.types.builtins.DATE, val => val)

// Override the built-in parser for int8
pg.types.setTypeParser(pg.types.builtins.INT8, val => val)

// Decimals as numbers
pg.types.setTypeParser(pg.types.builtins.NUMERIC, val => parseFloat(val))

const ca_cert_filename = 'ca-certificate.crt'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Wait for a connection for 2 seconds
  options: '-c timezone=UTC',
  ssl: useSSL
    ? {
        rejectUnauthorized: true,
        ca: fs.readFileSync(ca_cert_filename).toString(),
      }
    : undefined,
})

const dialect = new PostgresDialect({
  pool,
})

// Function to close the pool
const closeDb = async (): Promise<void> => {
  await pool.end() // Close all connections in the pool
  await db.destroy() // Destroy the Kysely instance
}

export const db = new Kysely<DB>({ dialect })
export { closeDb } // Export the pool for testing
