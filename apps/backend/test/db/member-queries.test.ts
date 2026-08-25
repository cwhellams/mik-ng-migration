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
  updateMemberLang,
  suspendMemberReservations,
  restoreMemberReservations,
  canMemberBeDeleted,
  deactivateMember,
  restoreMember,
  hasMemberFlownBillableFlightInYear,
  getUnpaidMembershipFeesForYear,
  wasMemberFeeCredited,
  setMemberAvatar,
  clearMemberAvatar,
} from '../../src/db/member-queries.ts'
import { db } from '../../src/db/connection.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import { MIKLang, MIKMemberTypes, MIKPermissions, type MemberRole } from '@mik/contracts/members'
import type { Upsert } from '@mik/contracts/schema'
import { deleteSimplbooksOutbox } from './__helpers__/simplbooksDbHelpers.ts'
import { MIKInvoiceType } from '@mik/contracts/invoicing'
import { randomUUID } from 'crypto'
import { SimplbooksEventType } from '../../src/services/simplbooks/models.ts'

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
      emailVerifiedAt: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      updatedBy: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map((r) => ({
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
      emailVerifiedAt: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map((r) => ({
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
      emailVerifiedAt: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map((r) => ({
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
      emailVerifiedAt: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: expect.any(String),
      memberSince: expect.any(String),
      membershipApprovedAt: expect.any(String),
      roles: result?.roles.map((r) => ({
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
    expect(result.map((r) => r.roleId)).toEqual(['ADMIN', 'CHAIRMAN', 'PLANE_CAPTAIN'])
  })

  it('getMemberRolesByMemberId should return roles for given valid member', async () => {
    const result = await getMemberRolesByMemberId('Matti1')
    expect(result).toMatchSnapshot(
      result.map((r) => ({
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
    const sortedMembers = result.slice(0, 10).sort((a, b) => a.memberId.localeCompare(b.memberId))
    // test only first 10 items in the test data
    expect(sortedMembers).toMatchSnapshot(
      sortedMembers.map((member) => ({
        ...member,
        ...(member.memberSince !== undefined ? { memberSince: expect.any(String) } : {}),
      })),
    )
  })

  it('getMembers should return unapproved members for admins', async () => {
    const result = await getMembers(true, [], {
      showUnapproved: true,
    })
    const sortedMembers = result.slice(0, 10).sort((a, b) => a.memberId.localeCompare(b.memberId))
    // test only first 10 items in the test data
    expect(sortedMembers).toMatchSnapshot(
      sortedMembers.map((member) => ({
        ...member,
        ...(member.memberSince !== undefined ? { memberSince: expect.any(String) } : {}),
      })),
    )
  })

  it('getMembers should return everything for admins', async () => {
    const result = await getMemberRoleById('ADMIN')
    // test only first 10 items in the test data
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('getMembers resolves a presigned avatarUrl for a member with a populated storage key', async () => {
    await setMemberAvatar('Matti1', 'member-avatars/test.jpg', jwt)
    try {
      const result = await getMembers(true, [], {})
      const matti = result.find((member) => member.memberId === 'Matti1')

      expect(matti?.avatarUrl).toEqual(expect.any(String))
      // The mock presigned URL is distinguished by its `?expires=` query param — a plain
      // stored URL (what a regression back to the un-presigned read path would return)
      // wouldn't have one.
      expect(matti?.avatarUrl).toMatch(/\?expires=\d+$/)
    } finally {
      await clearMemberAvatar('Matti1', 'member-avatars/test.jpg', jwt)
    }
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
      roles: result?.roles.map((r) => ({
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
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
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

  describe('updateMemberLang Tests', () => {
    it('should return false when updating lang for non-existent member', async () => {
      const result = await updateMemberLang('NonExistentMember', MIKLang.EN, jwt)
      expect(result).toBe(false)
    })

    it('should return true when updating lang for existing member', async () => {
      // Create a test member to avoid modifying shared test data
      const email = `${new Date().getTime()}@langtesttest.com`
      const memberId = await addMember({
        memberType: MIKMemberTypes.FLYING,
        email,
        firstName: 'LangTest',
        lastName: 'Member',
        lang: MIKLang.FI,
        streetAddress: 'Test Street',
        postcode: '00100',
        townCity: 'Test City',
        country: 'FI',
      })

      const result = await updateMemberLang(memberId, MIKLang.EN, jwt)
      expect(result).toBe(true)

      const updated = await getMemberById(memberId)
      expect(updated?.lang).toBe(MIKLang.EN)

      await removeMember(memberId)
    })
  })

  describe('Suspend and Restore Reservation Tests', () => {
    it('should suspend member reservations', async () => {
      // Create a test member and enable reservations first
      const email = `${new Date().getTime()}@suspendtest.com`
      const memberId = await addMember({
        memberType: MIKMemberTypes.FLYING,
        email,
        firstName: 'Suspend',
        lastName: 'Test',
        lang: MIKLang.FI,
        streetAddress: 'Test Street',
        postcode: '00100',
        townCity: 'Test City',
        country: 'FI',
      })

      // Enable reservations first since new members have it disabled by default
      await restoreMemberReservations(memberId)
      const memberBefore = await getMemberById(memberId)
      expect(memberBefore?.canMakeReservations).toBe(true)

      await suspendMemberReservations(memberId)

      const memberAfter = await getMemberById(memberId)
      expect(memberAfter?.canMakeReservations).toBe(false)

      await removeMember(memberId)
    })
  })

  it('should restore member reservations', async () => {
    // Create a test member to avoid modifying shared test data
    const email = `${new Date().getTime()}@restorerestest.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'RestoreRes',
      lastName: 'Test',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    // New members have reservations disabled by default
    const memberBefore = await getMemberById(memberId)
    expect(memberBefore?.canMakeReservations).toBe(false)

    // Restore reservations
    await restoreMemberReservations(memberId)
    const memberRestored = await getMemberById(memberId)
    expect(memberRestored?.canMakeReservations).toBe(true)

    await removeMember(memberId)
  })

  it('removeMember should throw if member has brevo contact id', async () => {
    const email = `${new Date().getTime()}@brevoremove.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'Brevo',
      lastName: 'Linked',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    try {
      await db
        .updateTable('member.register')
        .set({
          brevoContactId: 12345,
        })
        .where('memberId', '=', memberId)
        .execute()

      await expect(removeMember(memberId)).resolves.toBe(false)
    } finally {
      await db
        .updateTable('member.register')
        .set({
          brevoContactId: null,
        })
        .where('memberId', '=', memberId)
        .execute()

      await removeMember(memberId)
    }
  })
})

describe('canMemberBeDeleted Tests', () => {
  it('should return true for new member with no flights or invoices', async () => {
    const email = `${new Date().getTime()}@candelete.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'CanDelete',
      lastName: 'Test',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    const result = await canMemberBeDeleted(memberId)
    expect(result.canDelete).toBe(true)
    expect(result.hasInvoices).toBe(false)
    expect(result.hasFlights).toBe(false)
    expect(result.hasBookings).toBe(false)

    await removeMember(memberId)
  })

  it('should return false for member with flight logs', async () => {
    // Matti1 has flights in test data
    const result = await canMemberBeDeleted('Matti1')
    expect(result.canDelete).toBe(false)
    expect(result.hasFlights).toBe(true)
  })
})

describe('Deactivate and Restore Member Tests', () => {
  it('should deactivate a member', async () => {
    const email = `${new Date().getTime()}@deactivate.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'Deactivate',
      lastName: 'Test',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    const beforeMember = await getMemberById(memberId)
    expect(beforeMember?.memberType).not.toBe(MIKMemberTypes.REMOVED)

    await deactivateMember(memberId, jwt.memberId)

    const afterMember = await getMemberById(memberId)
    expect(afterMember?.memberType).toBe(MIKMemberTypes.REMOVED)
    expect(afterMember?.canMakeReservations).toBe(false)

    await removeMember(memberId)
  })

  it('should restore a deactivated member', async () => {
    const email = `${new Date().getTime()}@restore.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'Restore',
      lastName: 'Test',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    // Deactivate first
    await deactivateMember(memberId, jwt.memberId)
    const deactivatedMember = await getMemberById(memberId)
    expect(deactivatedMember?.memberType).toBe(MIKMemberTypes.REMOVED)

    // Then restore - should restore to original type (FLYING) and the exact
    // pre-removal flags, not defaults. canMakeReservations defaults to false
    // for a newly added member until an admin enables it.
    const restored = await restoreMember(memberId, jwt.memberId)
    expect(restored.memberType).toBe(MIKMemberTypes.FLYING)
    expect(restored.canMakeReservations).toBe(false)
    expect(restored.autoRenewAnnualMembership).toBe(true)
    expect(restored.autoRenewEquipmentFee).toBe(false)

    await removeMember(memberId)
  })

  it('should restore JUNIOR member to JUNIOR type, not FLYING', async () => {
    const email = `${new Date().getTime()}@restore-junior.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.JUNIOR,
      email,
      firstName: 'Junior',
      lastName: 'Test',
      lang: MIKLang.EN,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    // Verify initial type
    const beforeMember = await getMemberById(memberId)
    expect(beforeMember?.memberType).toBe(MIKMemberTypes.JUNIOR)

    // Deactivate
    await deactivateMember(memberId, jwt.memberId)
    const deactivatedMember = await getMemberById(memberId)
    expect(deactivatedMember?.memberType).toBe(MIKMemberTypes.REMOVED)

    // Restore - should return to JUNIOR, not FLYING
    const restored = await restoreMember(memberId, jwt.memberId)
    expect(restored.memberType).toBe(MIKMemberTypes.JUNIOR)

    await removeMember(memberId)
  })

  it('should restore HONORARY member to HONORARY type, not FLYING', async () => {
    const email = `${new Date().getTime()}@restore-honorary.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.HONORARY,
      email,
      firstName: 'Honorary',
      lastName: 'Test',
      lang: MIKLang.SV,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    // Verify initial type
    const beforeMember = await getMemberById(memberId)
    expect(beforeMember?.memberType).toBe(MIKMemberTypes.HONORARY)

    // Deactivate
    await deactivateMember(memberId, jwt.memberId)
    const deactivatedMember = await getMemberById(memberId)
    expect(deactivatedMember?.memberType).toBe(MIKMemberTypes.REMOVED)

    // Restore - should return to HONORARY, not FLYING
    const restored = await restoreMember(memberId, jwt.memberId)
    expect(restored.memberType).toBe(MIKMemberTypes.HONORARY)

    await removeMember(memberId)
  })

  it('should restore member with auto-renew flags preserved', async () => {
    const email = `${new Date().getTime()}@restore-autorenew.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'AutoRenew',
      lastName: 'Test',
      lang: MIKLang.EN,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    // Set auto-renew flags
    await updateMember(
      memberId,
      {
        autoRenewAnnualMembership: false,
        autoRenewEquipmentFee: true,
      },
      jwt,
    )

    const beforeMember = await getMemberById(memberId)
    expect(beforeMember?.autoRenewAnnualMembership).toBe(false)
    expect(beforeMember?.autoRenewEquipmentFee).toBe(true)

    // Deactivate and restore
    await deactivateMember(memberId, jwt.memberId)
    const restored = await restoreMember(memberId, jwt.memberId)

    // Flags should be restored
    expect(restored.autoRenewAnnualMembership).toBe(false)
    expect(restored.autoRenewEquipmentFee).toBe(true)

    await removeMember(memberId)
  })

  it('should restore member with can_make_reservations flag preserved', async () => {
    const email = `${new Date().getTime()}@restore-reservations.com`
    const memberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email,
      firstName: 'Reservations',
      lastName: 'Test',
      lang: MIKLang.EN,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })

    // Disable reservations
    await updateMember(
      memberId,
      {
        canMakeReservations: false,
      },
      jwt,
    )

    const beforeMember = await getMemberById(memberId)
    expect(beforeMember?.canMakeReservations).toBe(false)

    // Deactivate and restore
    await deactivateMember(memberId, jwt.memberId)
    const restored = await restoreMember(memberId, jwt.memberId)

    // Flag should be restored
    expect(restored.canMakeReservations).toBe(false)

    await removeMember(memberId)
  })
})

describe('hasMemberFlownInYear Tests', () => {
  it('should return false for member who has not flown in a future year', async () => {
    const futureYear = new Date().getFullYear() + 10
    const result = await hasMemberFlownBillableFlightInYear('Matti1', futureYear)
    expect(result).toBe(false)
  })

  it('should return false for non-existent member', async () => {
    const currentYear = new Date().getFullYear()
    const result = await hasMemberFlownBillableFlightInYear('NonExistent', currentYear)
    expect(result).toBe(false)
  })
})

describe('getUnpaidMembershipFeesForYear Tests', () => {
  const currentYear = new Date().getFullYear()
  let testMemberId: string
  // Small fixed IDs that fit in PostgreSQL integer and don't conflict with test data (max existing ~2788)
  const INV_ANNUAL = 50001
  const INV_JOINING = 50002
  const INV_PAID = 50003
  const INV_EQUIP = 50004

  beforeAll(async () => {
    testMemberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email: `${Date.now()}@unpaidfees.test`,
      firstName: 'UnpaidFees',
      lastName: 'Test',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })
  })

  afterAll(async () => {
    await db.deleteFrom('member.annualFees').where('memberId', '=', testMemberId).execute()
    await db.deleteFrom('accts.invoice').where('memberId', '=', testMemberId).execute()
    await removeMember(testMemberId)
  })

  it('should return empty array when member has no invoices', async () => {
    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result).toHaveLength(0)
  })

  it('should return unpaid annual fee invoice tracked in member.annual_fees', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_ANNUAL),
        memberId: testMemberId,
        invoiceType: MIKInvoiceType.ANNUAL_FEE,
        pmtRef: 'REF-ANNUAL',
        dueAt: `${currentYear}-12-31`,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annualFees')
      .values({
        memberId: testMemberId,
        feeType: 'annual_fee',
        year: currentYear,
        invoiceId: INV_ANNUAL,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result).toHaveLength(1)
    expect(result[0].invoice_type).toBe(MIKInvoiceType.ANNUAL_FEE)
    expect(result[0].pmt_ref).toBe('REF-ANNUAL')

    await db.deleteFrom('member.annualFees').where('invoiceId', '=', INV_ANNUAL).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_ANNUAL)).execute()
  })

  it('should return joining fee invoice when tracked as annual_fee in member.annual_fees', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_JOINING),
        memberId: testMemberId,
        invoiceType: MIKInvoiceType.JOINING_FEE,
        pmtRef: 'REF-JOINING',
        dueAt: `${currentYear}-12-31`,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annualFees')
      .values({
        memberId: testMemberId,
        feeType: 'annual_fee',
        year: currentYear,
        invoiceId: INV_JOINING,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    const joiningFee = result.find((r) => r.invoice_type === MIKInvoiceType.JOINING_FEE)
    expect(joiningFee).toBeDefined()
    expect(joiningFee?.pmt_ref).toBe('REF-JOINING')

    await db.deleteFrom('member.annualFees').where('invoiceId', '=', INV_JOINING).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_JOINING)).execute()
  })

  it('should not return a paid invoice', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_PAID),
        memberId: testMemberId,
        invoiceType: MIKInvoiceType.ANNUAL_FEE,
        pmtRef: 'REF-PAID',
        dueAt: `${currentYear}-12-31`,
        paidAt: `${currentYear}-01-15`,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annualFees')
      .values({
        memberId: testMemberId,
        feeType: 'annual_fee',
        year: currentYear,
        invoiceId: INV_PAID,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result.find((r) => r.pmt_ref === 'REF-PAID')).toBeUndefined()

    await db.deleteFrom('member.annualFees').where('invoiceId', '=', INV_PAID).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_PAID)).execute()
  })

  it('should not return unpaid equipment fee invoice', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_EQUIP),
        memberId: testMemberId,
        invoiceType: MIKInvoiceType.EQUIPMENT_FEE,
        pmtRef: 'REF-EQUIP',
        dueAt: `${currentYear}-12-31`,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annualFees')
      .values({
        memberId: testMemberId,
        feeType: 'equipment_fee',
        year: currentYear,
        invoiceId: INV_EQUIP,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result.find((r) => r.invoice_type === MIKInvoiceType.EQUIPMENT_FEE)).toBeUndefined()

    await db.deleteFrom('member.annualFees').where('invoiceId', '=', INV_EQUIP).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_EQUIP)).execute()
  })
})

describe('wasMemberFeeCredited Tests', () => {
  const currentYear = new Date().getFullYear()
  let testMemberId: string
  let invoiceId: string

  beforeAll(async () => {
    testMemberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email: `${Date.now()}@creditnote.test`,
      firstName: 'CreditNote',
      lastName: 'Test',
      lang: MIKLang.EN,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })
  })

  afterAll(async () => {
    await deleteSimplbooksOutbox()
    await db.deleteFrom('member.annualFees').where('memberId', '=', testMemberId).execute()
    await db.deleteFrom('accts.invoice').where('memberId', '=', testMemberId).execute()
    await removeMember(testMemberId)
  })

  it('should return false when member has no current-year fee invoice', async () => {
    const result = await wasMemberFeeCredited(testMemberId)
    expect(result).toBe(false)
  })

  it('should return false when member has current-year fee but no credit note', async () => {
    // Create invoice and annual_fees record
    const invoiceResult = await db
      .insertInto('accts.invoice')
      .values({
        id: '999999',
        memberId: testMemberId,
        invoiceType: MIKInvoiceType.ANNUAL_FEE,
        pmtRef: 'TEST-999999',
        dueAt: `${currentYear}-12-31`,
        createdBy: jwt.memberId,
        updatedBy: jwt.memberId,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    invoiceId = String(invoiceResult.id)

    await db
      .insertInto('member.annualFees')
      .values({
        memberId: testMemberId,
        year: currentYear,
        feeType: 'annual_fee',
        invoiceId: Number(invoiceId),
        createdBy: jwt.memberId,
        updatedBy: jwt.memberId,
      })
      .execute()

    const result = await wasMemberFeeCredited(testMemberId)
    expect(result).toBe(false)
  })

  it('should return false when credit note is PENDING, not SYNCED', async () => {
    // Create a PENDING credit note outbox row
    await db
      .insertInto('accts.outboxSimplbooks')
      .values({
        id: randomUUID(),
        eventType: SimplbooksEventType.CREDIT_NOTE,
        payload: JSON.stringify({ invoiceId }),
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
        status: 'PENDING',
      })
      .execute()

    const result = await wasMemberFeeCredited(testMemberId)
    expect(result).toBe(false)

    await deleteSimplbooksOutbox()
  })

  it('should return true when member has SYNCED credit note for current-year fee', async () => {
    // Create a SYNCED credit note outbox row
    await db
      .insertInto('accts.outboxSimplbooks')
      .values({
        id: randomUUID(),
        eventType: SimplbooksEventType.CREDIT_NOTE,
        payload: JSON.stringify({ invoiceId }),
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
        status: 'SYNCED',
      })
      .execute()

    const result = await wasMemberFeeCredited(testMemberId)
    expect(result).toBe(true)
  })
})
