import {
  getMemberRolesByMemberId,
  getMembers,
  getMemberByEmail,
  getMemberById,
  addMember,
  updateMember,
  getMemberRoleById,
  addMemberRole,
  updateMemberRole,
  removeMemberRole,
  removeMember,
  getMemberRolesByPermission,
  getDashboardSettings,
  setDashboardSettings,
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
  lastName: 'Test',
  email: 'loggedinuser',
  roles: [],
  permissions: [],
  canMakeReservations: false,
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

  it('getMemberRolesByPermission should return roles with given permission', async () => {
    const result = await getMemberRolesByPermission(MIKPermissions.BOOKING_ADMIN)
    expect(result.map(r => r.roleId)).toEqual(['ADMIN', 'PLANE_CAPTAIN'])
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
    const result = await getMembers(false, [], {
      showUnapproved: true,
    })
    // test only first 10 items in the test data
    expect(result.slice(0, 10)).toMatchSnapshot()
  })

  it('getMembers should return unapproved members for admins', async () => {
    const result = await getMembers(true, [], {
      showUnapproved: true,
    })
    // test only first 10 items in the test data
    expect(result.slice(0, 10)).toMatchSnapshot()
  })

  it('getMembers should return everything for admins', async () => {
    const result = await getMemberRoleById('ADMIN')
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
          sv: 'sv name',
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

    const beforeUpdate = await getMemberRoleById('MAINTENANCE')

    expect(await updateMemberRole('MAINTENANCE', updRole, jwt)).toEqual(true)

    const afterUpdate = await getMemberRoleById('MAINTENANCE')

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

  describe('Dashboard Settings Tests', () => {
    const testMemberId = 'Matti1'

    it('should return null when member has no dashboard settings', async () => {
      // First ensure the member has no settings
      await setDashboardSettings(testMemberId, null)

      const result = await getDashboardSettings(testMemberId)
      expect(result).toBeNull()
    })

    it('should save and retrieve dashboard settings', async () => {
      const settings = {
        components: [
          { id: 'weather', visible: true, order: 0 },
          { id: 'bookingUser', visible: false, order: 1 },
          { id: 'flightLogUser', visible: true, order: 2 },
        ],
      }

      await setDashboardSettings(testMemberId, settings)

      const result = await getDashboardSettings(testMemberId)
      expect(result).toEqual(settings)
    })

    it('should update existing dashboard settings', async () => {
      const initialSettings = {
        components: [
          { id: 'weather', visible: true, order: 0 },
          { id: 'bookingUser', visible: true, order: 1 },
        ],
      }

      await setDashboardSettings(testMemberId, initialSettings)

      const updatedSettings = {
        components: [
          { id: 'weather', visible: false, order: 1 },
          { id: 'bookingUser', visible: true, order: 0 },
          { id: 'flightLogUser', visible: true, order: 2 },
        ],
      }

      await setDashboardSettings(testMemberId, updatedSettings)

      const result = await getDashboardSettings(testMemberId)
      expect(result).toEqual(updatedSettings)
    })

    it('should clear dashboard settings when set to null', async () => {
      const settings = {
        components: [{ id: 'weather', visible: true, order: 0 }],
      }

      await setDashboardSettings(testMemberId, settings)
      expect(await getDashboardSettings(testMemberId)).toEqual(settings)

      await setDashboardSettings(testMemberId, null)
      expect(await getDashboardSettings(testMemberId)).toBeNull()
    })

    it('should handle all default dashboard components', async () => {
      const allComponentsSettings = {
        components: [
          { id: 'profileUpdateRequired', visible: true, order: 0 },
          { id: 'reservationsSuspended', visible: true, order: 1 },
          { id: 'overdueInvoice', visible: true, order: 2 },
          { id: 'equipmentFee', visible: true, order: 3 },
          { id: 'pendingReview', visible: true, order: 4 },
          { id: 'weather', visible: true, order: 5 },
          { id: 'bookingUser', visible: true, order: 6 },
          { id: 'flightLogUser', visible: true, order: 7 },
          { id: 'memberAdmin', visible: true, order: 8 },
          { id: 'flightLogAdmin', visible: true, order: 9 },
        ],
      }

      await setDashboardSettings(testMemberId, allComponentsSettings)

      const result = await getDashboardSettings(testMemberId)
      expect(result).toEqual(allComponentsSettings)
    })
  })
})
