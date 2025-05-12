import {
  getMemberRolesByMemberId,
  getMembers,
  getMemberByEmail,
  getMemberById,
  addMember,
  updateMember,
  getAllMemberRoleById,
  addMemberRole,
  updateMemberRole,
  removeMemberRole,
  removeMember,
} from '../../src/db/member-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import {
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
  type MemberRole,
} from '../../src/routes/members/models.ts'
import type { Upsert } from '../../src/types/schema.ts'
import { deleteSimplbooksOutbox } from './__helpers__/simplbooksDbHelpers.ts'

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  email: 'loggedinuser',
  permissions: [],
}

describe('Db query member tests', () => {
  beforeEach(async () => {
    await deleteSimplbooksOutbox()
  })

  it('getMemberById should return member data for a valid member id', async () => {
    const result = await getMemberById('Matti1')
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      updatedBy: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getMemberById should return undefined for an invalid member id', async () => {
    const result = await getMemberById('Iceman99')
    expect(result).toBeUndefined()
  })

  it('getMemberByEmail should return member data for a valid email address', async () => {
    const email = 'pekka.hamalainen@example.com'

    const result = await getMemberByEmail(email)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getMemberByEmail should return member data regardless of the case', async () => {
    const email = 'Pekka.HAMALAINEN@eXaMpLe.coM'

    const result = await getMemberByEmail(email)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })

  it('getMemberById should return member data for a valid id', async () => {
    const result = await getMemberById('Matti1')
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: expect.any(String),
      memberSince: expect.any(String),
      membershipApprovedAt: expect.any(String),
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

  it('getMemberRolesByMemberId should return roles for given valid member', async () => {
    const result = await getMemberRolesByMemberId('Matti1')
    expect(result).toMatchSnapshot(
      result.map(r => ({
        ...r,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    )
  })

  it('getMemberRolesByMemberId should return empty array for invalid member', async () => {
    const result = await getMemberRolesByMemberId('Iceman99')
    expect(result).toEqual([])
  })

  it('getMembers should return only approved members for valid members', async () => {
    const result = await getMembers(false, '', [], undefined)
    // test only first 10 items in the test data
    expect(result.slice(0, 10)).toMatchSnapshot()
  })

  it('getMembers should return everything for admins', async () => {
    const result = await getMembers(true, '', [], undefined)
    // test only first 10 items in the test data
    expect(result.slice(0, 10)).toMatchSnapshot()
  })

  it('getMembers should return everything for admins', async () => {
    const result = await getAllMemberRoleById('ADMIN')
    // test only first 10 items in the test data
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})

describe('Db add member tests', () => {
  const expectSnapshottedMember = async (memberId: string, email: string) => {
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
    const email = `${new Date().getTime()}@TESTDATA.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'test',
      lastName: 'member',
      lang: MIKLang.FI,
    })
    await expectSnapshottedMember(memberId, email.toLowerCase())
    await updateMember(
      memberId,
      { firstName: 'test2', email: `NEW-${email}`, roles: [{ roleId: 'MEMBER', isPublic: true }] },
      jwt,
    )
    await expectSnapshottedMember(memberId, `NEW-${email}`.toLowerCase())

    await removeMember(memberId)
  })

  describe('Member Role Tests', () => {
    it('Adds a member role to the database and then deletes it', async () => {
      const testRoleId = 'TEST_ROLE'

      const newRole: Upsert<MemberRole> = {
        roleId: testRoleId,
        description: 'My Desc',
        name: {
          en: 'en name',
          fi: 'fi name',
        },
        isPublic: true,
        permissions: [MIKPermissions.AIRCRAFT_ADMIN, MIKPermissions.BOOKING_ADMIN],
      }

      const createdRole = await addMemberRole(newRole, jwt)
      expect(createdRole).toMatchSnapshot({
        createdAt: expect.any(String),
        createdBy: jwt.memberId,
        updatedAt: expect.any(String),
        updatedBy: jwt.memberId,
      })

      await removeMemberRole(testRoleId)
    })
  })

  it('Updates a member role in the database', async () => {
    const updRole = {
      description: new Date().toISOString(),
    }

    const beforeUpdate = await getAllMemberRoleById('MAINTENANCE')

    expect(await updateMemberRole('MAINTENANCE', updRole, jwt)).toEqual(true)

    const afterUpdate = await getAllMemberRoleById('MAINTENANCE')

    expect(afterUpdate).toEqual({
      ...beforeUpdate,
      ...updRole,
      updatedAt: expect.any(String),
    })
  })

  it('Update to a non existent role returns false', async () => {
    const updRole = {
      description:
        'External service center user can log in and see flight logs and plane hours UPDATED',
    }

    expect(await updateMemberRole('NOT_FOUND', updRole, jwt)).toEqual(false)
  })

  it('Removing a member role that does not exist will return false', async () => {
    expect(await removeMemberRole('CANT_find_THIS')).toEqual(false)
  })
})
