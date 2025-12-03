import pg from 'pg'
import { SimplBooksClient } from './types.js'

const { Pool } = pg

/**
 * MIK_SIMPLBOOKS_MEMBER must stay synchronized with the backend's definition
 * (see apps/backend/src/services/simplbooks/simplbooksOutboxHandler.ts:39).
 * Consider setting the environment variable MIK_SIMPLBOOKS_MEMBER to override.
 */
export const MIK_SIMPLBOOKS_MEMBER: string =
  process.env.MIK_SIMPLBOOKS_MEMBER || 'simplbks'

interface MemberRecord {
  member_id: string
  email: string
  billing_id: string | null
}

interface RemovedMemberRecord {
  member_id: string
  email: string
  first_name: string
  last_name: string
  billing_id: string | null
}

export class DatabaseService {
  private pool: pg.Pool

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  }

  async connect(): Promise<void> {
    try {
      await this.pool.query('SELECT 1')
      console.log('Database connection established')
    } catch (error) {
      console.error('Failed to connect to database:', error)
      throw error
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
    console.log('Database connection closed')
  }

  async getMemberByEmail(email: string): Promise<MemberRecord | null> {
    const result = await this.pool.query<MemberRecord>(
      'SELECT member_id, email, billing_id FROM "member"."register" WHERE LOWER(email) = LOWER($1)',
      [email]
    )
    return result.rows[0] || null
  }

  async getRemovedMembers(): Promise<RemovedMemberRecord[]> {
    const result = await this.pool.query<RemovedMemberRecord>(
      `SELECT member_id, email, first_name, last_name, billing_id 
       FROM "member"."register" 
       WHERE member_type = 'REMOVED'`
    )
    return result.rows
  }

  async isEmailInActiveMembers(email: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM "member"."register" 
       WHERE LOWER(email) = LOWER($1) 
       AND member_type != 'REMOVED' 
       LIMIT 1`,
      [email]
    )
    return result.rows.length > 0
  }

  async updateMemberBillingId(
    client: SimplBooksClient,
    updatedBy: string = MIK_SIMPLBOOKS_MEMBER
  ): Promise<{ action: 'updated' | 'skipped' }> {
    // Check if client.e_mail is defined and non-empty
    if (!client.e_mail) {
      return { action: 'skipped' }
    }
    // Check if member exists
    const existingMember = await this.getMemberByEmail(client.e_mail)

    if (!existingMember) {
      return { action: 'skipped' }
    }

    try {
      await this.pool.query(
        `UPDATE "member"."register" 
         SET billing_id = $1,
             phone_number = $2,
             street_address = $3,
             postcode = $4,
             town_city = $5,
             updated_at = NOW(),
             updated_by = $6
         WHERE LOWER(email) = LOWER($7)`,
        [
          client.id.toString(),
          client.phone,
          client.address_street,
          client.address_postal_code,
          client.address_city,
          updatedBy,
          client.e_mail,
        ]
      )

      console.log(
        `✓ Updated member ${client.e_mail}: billing_id=${client.id}, address updated`
      )

      return { action: 'updated' }
    } catch (error) {
      console.error(`✗ Failed to update member for ${client.e_mail}:`, error)
      throw error
    }
  }
}
