import { jest } from '@jest/globals'
import {
  brevoApiClient,
  getSentCampaigns,
  getCampaignById,
} from '../../../src/services/brevo/brevoClient.ts'
import logger from '../../../src/lib/logger.ts'

// Mock environment variables
process.env.BREVO_API_KEY = 'test-api-key'
process.env.BREVO_API_URL = 'https://api.brevo.com/v3'

describe('Brevo Campaign Client', () => {
  let mockGet: jest.SpiedFunction<typeof brevoApiClient.get>

  beforeAll(() => {
    jest.spyOn(logger, 'info').mockReturnValue(logger)
    jest.spyOn(logger, 'error').mockReturnValue(logger)
    jest.spyOn(logger, 'warn').mockReturnValue(logger)
    jest.spyOn(logger, 'debug').mockReturnValue(logger)
  })

  beforeEach(() => {
    mockGet = jest.spyOn(brevoApiClient, 'get')
  })

  afterEach(() => {
    mockGet.mockRestore()
  })

  describe('getSentCampaigns', () => {
    it('returns the sent campaigns from the list endpoint', async () => {
      mockGet.mockResolvedValue({
        data: {
          campaigns: [
            {
              id: 1,
              name: 'January Newsletter',
              subject: 'Hello members!',
              status: 'sent',
              sentDate: '2026-01-15T08:00:00.000Z',
            },
          ],
          count: 1,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const result = await getSentCampaigns(new Date('2026-01-01T00:00:00.000Z'))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].subject).toBe('Hello members!')
      expect(mockGet).toHaveBeenCalledWith(
        '/emailCampaigns',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'sent', startDate: '2026-01-01' }),
        }),
      )
    })

    it('propagates errors on failure', async () => {
      mockGet.mockRejectedValue(new Error('network down'))
      await expect(getSentCampaigns(new Date())).rejects.toThrow('network down')
    })
  })

  describe('getCampaignById', () => {
    it('returns full campaign detail including htmlContent', async () => {
      mockGet.mockResolvedValue({
        data: {
          id: 42,
          name: 'January Newsletter',
          subject: 'Hello members!',
          status: 'sent',
          sentDate: '2026-01-15T08:00:00.000Z',
          htmlContent: '<html><body>Hi</body></html>',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const result = await getCampaignById(42)

      expect(result.htmlContent).toBe('<html><body>Hi</body></html>')
      expect(mockGet).toHaveBeenCalledWith('/emailCampaigns/42')
    })

    it('propagates errors on failure', async () => {
      mockGet.mockRejectedValue(new Error('not found'))
      await expect(getCampaignById(999)).rejects.toThrow('not found')
    })
  })
})
