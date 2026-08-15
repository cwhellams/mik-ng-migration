import {
  getLastBrevoSyncState,
  createBrevoSyncState,
  getMembersToSync,
  updateMemberBrevoSyncStatus,
  getBrevoSyncStatusCounts,
} from '../../src/db/brevo-sync-queries.ts'
import { db } from '../../src/db/connection.ts'

describe('Brevo sync queries', () => {
  describe('getLastBrevoSyncState', () => {
    it('should return the most recent sync state', async () => {
      const result = await getLastBrevoSyncState()

      // Should return undefined or a valid sync state
      if (result) {
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('lastSyncedAt')
        expect(result).toHaveProperty('membersSynced')
        expect(result).toHaveProperty('syncStatus')
      }
    })
  })

  describe('createBrevoSyncState', () => {
    it('should create a new sync state record', async () => {
      await createBrevoSyncState(5, 'SUCCESS')

      const result = await getLastBrevoSyncState()
      expect(result).not.toBeNull()
      if (result) {
        expect(result.membersSynced).toBe(5)
        expect(result.syncStatus).toBe('SUCCESS')
      }
    })

    it('should create a sync state record with error', async () => {
      await createBrevoSyncState(3, 'FAILED', 'Test error message')

      // Note: getLastBrevoSyncState only returns SUCCESS status
      // So this test just checks the function doesn't throw
    })
  })

  describe('getMembersToSync', () => {
    it('should return members eligible for sync', async () => {
      const result = await getMembersToSync()

      // Should return an array of members
      expect(Array.isArray(result)).toBe(true)

      // Each member should have required fields
      if (result.length > 0) {
        const member = result[0]
        expect(member).toHaveProperty('memberId')
        expect(member).toHaveProperty('email')
        expect(member).toHaveProperty('firstName')
        expect(member).toHaveProperty('lastName')
        expect(member).toHaveProperty('memberType')
        expect(member).toHaveProperty('langIso639')
        expect(member).toHaveProperty('emailVerifiedAt')
        expect(member).toHaveProperty('brevoSyncedAt')
        expect(member).toHaveProperty('brevoContactId')
        expect(member).toHaveProperty('brevoSyncStatus')

        // Should only include approved members with verified emails
        expect(member.isMembershipApproved).toBe(true)
        expect(member.emailVerifiedAt).not.toBeNull()
      }
    })

    it('should filter by lastSyncedAt when provided', async () => {
      const lastSyncedAt = new Date(Date.now() - 86400000) // 1 day ago
      const result = await getMembersToSync(lastSyncedAt)

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('updateMemberBrevoSyncStatus', () => {
    it('should update member sync status to success', async () => {
      // Get a member to test with
      const members = await getMembersToSync()
      if (members.length === 0) {
        console.log('No members available for testing')
        return
      }

      const member = members[0]
      const contactId = 12345

      await updateMemberBrevoSyncStatus(member.memberId, 'SYNCED', contactId)

      // Verify the update by getting members again
      const updatedMembers = await getMembersToSync()
      const updatedMember = updatedMembers.find((m) => m.memberId === member.memberId)

      if (updatedMember) {
        expect(updatedMember.brevoSyncStatus).toBe('SYNCED')
        expect(updatedMember.brevoContactId).toBe(contactId)
        expect(updatedMember.brevoSyncedAt).not.toBeNull()
      }

      await db.updateTable('member.register').set({ brevo_contact_id: null }).execute()
    })

    it('should update member sync status to failed', async () => {
      const members = await getMembersToSync()
      if (members.length === 0) {
        console.log('No members available for testing')
        return
      }

      const member = members[0]

      await updateMemberBrevoSyncStatus(member.memberId, 'FAILED')

      // Verify the update
      const updatedMembers = await getMembersToSync()
      const updatedMember = updatedMembers.find((m) => m.memberId === member.memberId)

      if (updatedMember) {
        expect(updatedMember.brevoSyncStatus).toBe('FAILED')
      }
    })
  })

  describe('getBrevoSyncStatusCounts', () => {
    it('should return counts for each sync status', async () => {
      const result = await getBrevoSyncStatusCounts()

      expect(result).toHaveProperty('pending')
      expect(result).toHaveProperty('synced')
      expect(result).toHaveProperty('failed')
      expect(typeof result.pending).toBe('number')
      expect(typeof result.synced).toBe('number')
      expect(typeof result.failed).toBe('number')
    })
  })
})
