import {
  getLastBrevoCampaignArchiveState,
  createBrevoCampaignArchiveState,
  updateBrevoCampaignArchiveState,
  isCampaignAlreadyArchived,
} from '../../src/db/brevo-campaign-archive-queries.ts'
import { db } from '../../src/db/connection.ts'

describe('Brevo campaign archive queries', () => {
  afterEach(async () => {
    await db.deleteFrom('member.brevo_campaign_archive_state').execute()
    await db.deleteFrom('member.documents').where('category', '=', 'newsletter').execute()
  })

  describe('getLastBrevoCampaignArchiveState', () => {
    it('returns null when no state row exists', async () => {
      const result = await getLastBrevoCampaignArchiveState()
      expect(result).toBeNull()
    })

    it('returns the most recently synced state row', async () => {
      await createBrevoCampaignArchiveState(new Date('2026-01-01T00:00:00.000Z'), 2, 'SUCCESS')
      await createBrevoCampaignArchiveState(new Date('2026-01-02T00:00:00.000Z'), 3, 'SUCCESS')

      const result = await getLastBrevoCampaignArchiveState()

      expect(result).not.toBeNull()
      expect(result?.campaigns_archived).toBe(3)
      expect(result?.sync_status).toBe('SUCCESS')
    })
  })

  describe('createBrevoCampaignArchiveState', () => {
    it('creates a state row with the given values', async () => {
      const id = await createBrevoCampaignArchiveState(
        new Date('2026-01-01T00:00:00.000Z'),
        0,
        'SUCCESS',
      )

      const result = await getLastBrevoCampaignArchiveState()
      expect(result?.id).toBe(id)
      expect(result?.campaigns_archived).toBe(0)
      expect(result?.error_message).toBeNull()
    })
  })

  describe('updateBrevoCampaignArchiveState', () => {
    it('clears a stale error_message on a later successful run', async () => {
      const id = await createBrevoCampaignArchiveState(
        new Date('2026-01-01T00:00:00.000Z'),
        0,
        'FAILED',
        'Brevo API timed out',
      )

      let result = await getLastBrevoCampaignArchiveState()
      expect(result?.error_message).toBe('Brevo API timed out')

      await updateBrevoCampaignArchiveState(id, new Date('2026-01-02T00:00:00.000Z'), 4, 'SUCCESS')

      result = await getLastBrevoCampaignArchiveState()
      expect(result?.sync_status).toBe('SUCCESS')
      expect(result?.campaigns_archived).toBe(4)
      expect(result?.error_message).toBeNull()
    })
  })

  describe('isCampaignAlreadyArchived', () => {
    it('returns false when no document is tagged with the campaign id', async () => {
      const result = await isCampaignAlreadyArchived(999999)
      expect(result).toBe(false)
    })

    it('returns true once a newsletter document is tagged with the campaign id', async () => {
      await db
        .insertInto('member.documents')
        .values({
          title: 'Test Newsletter',
          category: 'newsletter',
          is_public: true,
          tags: ['brevo-campaign-id:555'],
          created_by: 'k1mnimda',
          updated_by: 'k1mnimda',
        })
        .execute()

      const result = await isCampaignAlreadyArchived(555)
      expect(result).toBe(true)
    })

    it('does not match a different campaign id sharing a numeric prefix', async () => {
      await db
        .insertInto('member.documents')
        .values({
          title: 'Test Newsletter',
          category: 'newsletter',
          is_public: true,
          tags: ['brevo-campaign-id:5551'],
          created_by: 'k1mnimda',
          updated_by: 'k1mnimda',
        })
        .execute()

      const result = await isCampaignAlreadyArchived(555)
      expect(result).toBe(false)
    })
  })
})
