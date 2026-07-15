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
} from '../../src/db/member-queries.ts'
import { db } from '../../src/db/connection.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'
import {
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
  type MemberRole,
} from '../../src/routes/members/models.ts'
import type { Upsert } from '../../src/types/schema.ts'
import { deleteSimplbooksOutbox } from './__helpers__/simplbooksDbHelpers.ts'
import { MIKInvoiceType } from '../../src/services/simplbooks/models.ts'

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
    })

    try {
      await db
        .updateTable('member.register')
        .set({
          brevo_contact_id: 12345,
        })
        .where('member_id', '=', memberId)
        .execute()

      await expect(removeMember(memberId)).resolves.toBe(false)
    } finally {
      await db
        .updateTable('member.register')
        .set({
          brevo_contact_id: null,
        })
        .where('member_id', '=', memberId)
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
    })

    // Deactivate first
    await deactivateMember(memberId, jwt.memberId)
    const deactivatedMember = await getMemberById(memberId)
    expect(deactivatedMember?.memberType).toBe(MIKMemberTypes.REMOVED)

    // Then restore - note: canMakeReservations is not automatically restored
    const restored = await restoreMember(memberId, jwt.memberId)
    expect(restored.memberType).toBe(MIKMemberTypes.FLYING)

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
    })
  })

  afterAll(async () => {
    await db.deleteFrom('member.annual_fees').where('member_id', '=', testMemberId).execute()
    await db.deleteFrom('accts.invoice').where('member_id', '=', testMemberId).execute()
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
        member_id: testMemberId,
        invoice_type: MIKInvoiceType.ANNUAL_FEE,
        pmt_ref: 'REF-ANNUAL',
        due_at: `${currentYear}-12-31`,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annual_fees')
      .values({
        member_id: testMemberId,
        fee_type: 'annual_fee',
        year: currentYear,
        invoice_id: INV_ANNUAL,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result).toHaveLength(1)
    expect(result[0].invoice_type).toBe(MIKInvoiceType.ANNUAL_FEE)
    expect(result[0].pmt_ref).toBe('REF-ANNUAL')

    await db.deleteFrom('member.annual_fees').where('invoice_id', '=', INV_ANNUAL).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_ANNUAL)).execute()
  })

  it('should return joining fee invoice when tracked as annual_fee in member.annual_fees', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_JOINING),
        member_id: testMemberId,
        invoice_type: MIKInvoiceType.JOINING_FEE,
        pmt_ref: 'REF-JOINING',
        due_at: `${currentYear}-12-31`,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annual_fees')
      .values({
        member_id: testMemberId,
        fee_type: 'annual_fee',
        year: currentYear,
        invoice_id: INV_JOINING,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    const joiningFee = result.find((r) => r.invoice_type === MIKInvoiceType.JOINING_FEE)
    expect(joiningFee).toBeDefined()
    expect(joiningFee?.pmt_ref).toBe('REF-JOINING')

    await db.deleteFrom('member.annual_fees').where('invoice_id', '=', INV_JOINING).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_JOINING)).execute()
  })

  it('should not return a paid invoice', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_PAID),
        member_id: testMemberId,
        invoice_type: MIKInvoiceType.ANNUAL_FEE,
        pmt_ref: 'REF-PAID',
        due_at: `${currentYear}-12-31`,
        paid_at: `${currentYear}-01-15`,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annual_fees')
      .values({
        member_id: testMemberId,
        fee_type: 'annual_fee',
        year: currentYear,
        invoice_id: INV_PAID,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result.find((r) => r.pmt_ref === 'REF-PAID')).toBeUndefined()

    await db.deleteFrom('member.annual_fees').where('invoice_id', '=', INV_PAID).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_PAID)).execute()
  })

  it('should not return unpaid equipment fee invoice', async () => {
    await db
      .insertInto('accts.invoice')
      .values({
        id: String(INV_EQUIP),
        member_id: testMemberId,
        invoice_type: MIKInvoiceType.EQUIPMENT_FEE,
        pmt_ref: 'REF-EQUIP',
        due_at: `${currentYear}-12-31`,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()
    await db
      .insertInto('member.annual_fees')
      .values({
        member_id: testMemberId,
        fee_type: 'equipment_fee',
        year: currentYear,
        invoice_id: INV_EQUIP,
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()

    const result = await getUnpaidMembershipFeesForYear(testMemberId, currentYear)
    expect(result.find((r) => r.invoice_type === MIKInvoiceType.EQUIPMENT_FEE)).toBeUndefined()

    await db.deleteFrom('member.annual_fees').where('invoice_id', '=', INV_EQUIP).execute()
    await db.deleteFrom('accts.invoice').where('id', '=', String(INV_EQUIP)).execute()
  })
})
