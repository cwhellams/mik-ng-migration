import 'dotenv/config'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { readFileSync } from 'fs'
import logger from '../lib/logger.ts'

import type { DB } from './schema.d.ts'

//Digital Ocean requires SSL connection to the database with a CA Certificate also used
const useSSL = process.env.DB_SSL

// Read CA certificate from file or environment variable
let caCert: string | undefined

if (useSSL) {
  try {
    const certFile = process.env.DATABASE_CA_CERT_FILE || './ca-certificate.crt'
    caCert = readFileSync(certFile, 'utf-8')
    logger.info(`Loaded CA certificate from ${certFile}`)
  } catch (error) {
    logger.error('Failed to read CA certificate file:', error)
    throw error
  }
}

// Parse dates as strings - this is necessary because the PostgreSQL driver
// returns dates as Date objects by default, which can cause issues
// due to times being included in the date with timezone conversions
// This can result in dates being off by a day when stored in the database
// and retrieved back as Date objects
pg.types.setTypeParser(pg.types.builtins.DATE, val => val)

// Override the built-in parser for int8
pg.types.setTypeParser(pg.types.builtins.INT8, val => val)

// Decimals as numbers
pg.types.setTypeParser(pg.types.builtins.NUMERIC, val => Number.parseFloat(val))

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: Number.parseInt(process.env.DATABASE_CN_TIMEOUT || '10000', 10), // Wait for a connection
  options: '-c timezone=UTC',
  ssl: useSSL
    ? {
        rejectUnauthorized: true,
        ca: caCert,
      }
    : undefined, // Fallback if not present
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

// Test database connection
export const testConnection = async (): Promise<void> => {
  try {
    await pool.query('SELECT 1')
    logger.info('Database connection verified')
  } catch (error) {
    logger.error('Database connection test failed:', error)
    throw error
  }
}

export { closeDb } // Export the pool for testing
