import dotenv from 'dotenv'
import { getMember } from '../../src/db/queries'
import { closeDb } from '../../src/db/connection'

dotenv.config()

describe('Db query tests', () => {
  it('should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMember(email)
    expect(result).toMatchSnapshot()
  })
})

afterAll(async () => {
  // Close the pool after all tests
  await closeDb()
})
