import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { DB } from 'kysely-codegen'
import logger from '../lib/logger'

dotenv.config()

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
})

export const db = new Kysely<DB>({ dialect })

logger.info('Connected to PostgreSQL!')
