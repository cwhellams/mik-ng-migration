import { closeDb } from '../../src/db/connection.ts'
import {
  getMemberRoles,
  getMembers,
  getMemberByEmail,
  getMemberById,
} from '../../src/db/member-queries.ts'

describe('Db query member tests', () => {
  afterAll(async () => {
    // Close the pool after all tests
    await closeDb()
  })

  it('getMember should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMemberByEmail(email)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
    })
  })

  it('getMemberById should return member data for a valid id', async () => {
    const result = await getMemberById(1)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
    })
  })

  it('getMember should return undefined for an invalid email address', async () => {
    const email = 'cheddar.cheese@cheezy.com'

    const result = await getMemberByEmail(email)
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
    // test only first 10 items in the test data
    expect(result.filter(m => m.memberId <= 10)).toMatchSnapshot()
  })
})
