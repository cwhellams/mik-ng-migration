import { closeDb } from '../../src/db/connection.ts'
import {
  getMemberRoles,
  getMembers,
  getMemberByEmail,
  getMemberById,
  addMember,
  updateMember,
} from '../../src/db/member-queries.ts'
import { MIKMemberTypes } from '../../src/routes/members/models.ts'

describe('Db query member tests', () => {
  it('getMemberById should return member data for a valid member id', async () => {
    const result = await getMemberById(1)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getMemberById should return undefined for an invalid member id', async () => {
    const result = await getMemberById(-1)
    expect(result).toBeUndefined()
  })

  it('getMemberByEmail should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMemberByEmail(email)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getMemberById should return member data for a valid id', async () => {
    const result = await getMemberById(1)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getMemberByEmail should return undefined for an invalid email address', async () => {
    const email = 'cheddar.cheese@cheezy.com'

    const result = await getMemberByEmail(email)
    expect(result).toBeUndefined()
  })

  it('getMemberRoles should return roles for given valid member', async () => {
    const result = await getMemberRoles(1)
    expect(result).toMatchSnapshot(
      result.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    )
  })

  it('getMemberRoles should return empty array for invalid member', async () => {
    const result = await getMemberRoles(-99)
    expect(result).toEqual([])
  })

  it('getMembers should return only approved members for valid members', async () => {
    const result = await getMembers(false, '', [])
    // test only first 10 items in the test data
    expect(result.filter(m => m.memberId <= 10)).toMatchSnapshot()
  })

  it('getMembers should return everything for admins', async () => {
    const result = await getMembers(true, '', [])
    // test only first 10 items in the test data
    expect(result.filter(m => m.memberId <= 10)).toMatchSnapshot()
  })
})

describe('Db add member tests', () => {
  const expectSnapshottetMember = async (memberId: number, email: string) => {
    const result = await getMemberById(memberId)
    expect(result?.memberId).toEqual(memberId)
    expect(result?.email).toEqual(email)
    expect({
      ...result,
      memberId: 0,
      createdBy: 0,
      updatedBy: 0,
      email: 'test@testdata.com',
    }).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  }

  it('add member and update member', async () => {
    const email = `${new Date().getTime()}@testdata.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'test',
      lastName: 'member',
      lang: 'fi',
    })
    await expectSnapshottetMember(memberId, email)

    await updateMember(
      memberId,
      { firstName: 'test2', roles: [{ roleId: 'MEMBER', isPublic: true }] },
      {
        memberId: 1,
        email: 'loggedinuser',
        permissions: [],
      },
    )
    await expectSnapshottetMember(memberId, email)
  })

  afterAll(async () => {
    // Close the pool after all tests
    await closeDb()
  })
})
