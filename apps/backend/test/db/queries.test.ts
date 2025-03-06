import dotenv from 'dotenv'
import { getMember } from '../../src/db/queries'

dotenv.config()

describe('Db query tests', () => {
  it('should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMember(email)
    expect(result).toMatchSnapshot()
  })
})
