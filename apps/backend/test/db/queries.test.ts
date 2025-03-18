import dotenv from 'dotenv'

import { closeDb } from '../../src/db/connection.ts'
import { getMember, getMemberRoles, getMembers } from '../../src/db/queries.ts'

dotenv.config()

describe('Db query tests', () => {
  it('getMember should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMember(email)
    expect(result).toMatchSnapshot({
      created_at: expect.any(Date),
      date_of_birth: expect.any(Date),
      updated_at: expect.any(Date),
      member_since: expect.any(Date),
    })
  })

  it('getMember should return undefined for an invalid email address', async () => {
    const email = 'cheddar.cheese@cheezy.com'

    const result = await getMember(email)
    expect(result).toBeUndefined()
  })

  it('getMemberRoles should return roles for given valid member', async () => {
    const result = await getMemberRoles(1)
    expect(result).toMatchSnapshot()
  })

  it('getMemberRoles should return empty array for invalid member', async () => {
    const result = await getMemberRoles(-99)
    expect(result).toEqual([])
  })

  it('getMembers should return members', async () => {
    const result = await getMembers()
    expect(result).toMatchSnapshot()
  })
})

afterAll(async () => {
  // Close the pool after all tests
  await closeDb()
})
