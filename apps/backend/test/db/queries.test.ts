import dotenv from 'dotenv'

import { closeDb } from '../../src/db/connection.ts'
import { getMember } from '../../src/db/queries.ts'

dotenv.config()

describe('Db query tests', () => {
  it('should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMember(email)
    expect(result).toMatchSnapshot({
      created_at: expect.any(Date),
      date_of_birth: expect.any(Date),
      last_updated: expect.any(Date),
      member_since: expect.any(Date),
    })
  })
})

afterAll(async () => {
  // Close the pool after all tests
  await closeDb()
})
