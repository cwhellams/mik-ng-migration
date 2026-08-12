import { jest } from '@jest/globals'
import {
  brevoApiClient,
  createContact,
  updateContact,
  deleteContact,
  getContactByEmail,
  getContactByExtId,
} from '../../../src/services/brevo/brevoClient.ts'
import {
  mockBrevoPost,
  mockBrevoPut,
  mockBrevoDelete,
  mockBrevoGet,
} from '../../__mocks__/brevoMock.ts'
import logger from '../../../src/lib/logger.ts'
import { MIKMemberTypes, MIKLang } from '@mik/contracts/members'

// Mock environment variables
process.env.BREVO_API_KEY = 'test-api-key'
process.env.BREVO_API_URL = 'https://api.brevo.com/v3'

describe('Brevo API Client', () => {
  let mockPost: jest.SpiedFunction<typeof brevoApiClient.post>
  let mockPut: jest.SpiedFunction<typeof brevoApiClient.put>
  let mockDelete: jest.SpiedFunction<typeof brevoApiClient.delete>
  let mockGet: jest.SpiedFunction<typeof brevoApiClient.get>

  beforeAll(() => {
    jest.spyOn(logger, 'info').mockReturnValue(logger)
    jest.spyOn(logger, 'error').mockReturnValue(logger)
    jest.spyOn(logger, 'warn').mockReturnValue(logger)
    jest.spyOn(logger, 'debug').mockReturnValue(logger)

    mockPost = jest.spyOn(brevoApiClient, 'post').mockImplementation(mockBrevoPost)
    mockPut = jest.spyOn(brevoApiClient, 'put').mockImplementation(mockBrevoPut)
    mockDelete = jest.spyOn(brevoApiClient, 'delete').mockImplementation(mockBrevoDelete)
    mockGet = jest.spyOn(brevoApiClient, 'get').mockImplementation(mockBrevoGet)
  })

  beforeEach(() => {
    // Reset to default implementations
    mockPost.mockImplementation(mockBrevoPost)
    mockPut.mockImplementation(mockBrevoPut)
    mockDelete.mockImplementation(mockBrevoDelete)
    mockGet.mockImplementation(mockBrevoGet)
  })

  describe('createContact', () => {
    it('should successfully create a contact', async () => {
      const contact = {
        email: 'test@example.com',
        ext_id: 'member123',
        attributes: {
          FIRSTNAME: 'Test',
          LASTNAME: 'User',
          MEMBER_TYPE: MIKMemberTypes.FLYING,
          LANG_ISO639: MIKLang.EN,
          IS_MEMBERSHIP_EXPIRED: false,
          EMAIL_VERIFIED: true,
        },
        listIds: [5, 4],
      }

      const result = await createContact(contact)

      expect(result).toBeGreaterThan(0)
    })

    it('should handle duplicate contact error by returning existing contact ID', async () => {
      const contact = {
        email: 'duplicate@example.com',
        ext_id: 'member456',
        attributes: {
          FIRSTNAME: 'Duplicate',
          LASTNAME: 'User',
          MEMBER_TYPE: MIKMemberTypes.FLYING,
          LANG_ISO639: MIKLang.EN,
          IS_MEMBERSHIP_EXPIRED: false,
          EMAIL_VERIFIED: true,
        },
        listIds: [5],
      }

      const result = await createContact(contact)
      expect(result).toBe(12345)
    })

    it('should handle network errors', async () => {
      mockPost.mockRejectedValue(new Error('Network error'))

      const contact = {
        email: 'test@example.com',
        ext_id: 'member789',
        attributes: {
          FIRSTNAME: 'Test',
          LASTNAME: 'User',
          MEMBER_TYPE: MIKMemberTypes.FLYING,
          LANG_ISO639: MIKLang.EN,
          IS_MEMBERSHIP_EXPIRED: false,
          EMAIL_VERIFIED: true,
        },
        listIds: [5],
      }

      await expect(createContact(contact)).rejects.toThrow('Network error')
    })
  })

  describe('updateContact', () => {
    it('should successfully update a contact by email', async () => {
      const update = {
        attributes: {
          FIRSTNAME: 'Updated',
          LASTNAME: 'Name',
          MEMBER_TYPE: MIKMemberTypes.NONFLYING,
          LANG_ISO639: MIKLang.FI,
          IS_MEMBERSHIP_EXPIRED: false,
          EMAIL_VERIFIED: true,
        },
        listIds: [7, 4],
      }

      await updateContact(12345, update)
    })

    it('should throw when contact not found', async () => {
      const update = {
        attributes: {
          FIRSTNAME: 'Test',
          LASTNAME: 'User',
          MEMBER_TYPE: MIKMemberTypes.FLYING,
          LANG_ISO639: MIKLang.EN,
          IS_MEMBERSHIP_EXPIRED: false,
          EMAIL_VERIFIED: true,
        },
        listIds: [5],
      }

      await expect(updateContact(999999, update)).rejects.toThrow()
    })
  })

  describe('deleteContact', () => {
    it('should successfully delete a contact', async () => {
      await deleteContact(12345)
    })

    it('should handle contact not found error gracefully', async () => {
      // deleteContact should not throw when contact is not found
      await expect(deleteContact(999999)).resolves.toBeUndefined()
    })
  })

  describe('getContactByEmail', () => {
    it('should successfully retrieve a contact by email', async () => {
      const result = await getContactByEmail('test@example.com')

      expect(result).not.toBeNull()
      if (result) {
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('email')
        expect(result).toHaveProperty('attributes')
        expect(result.email).toBe('test@example.com')
      }
    })

    it('should handle contact not found error', async () => {
      const result = await getContactByEmail('notfound@example.com')
      expect(result).toBeNull()
    })
  })

  describe('getContactByExtId', () => {
    it('should successfully retrieve a contact by ext_id', async () => {
      const result = await getContactByExtId('member123')

      expect(result).not.toBeNull()
      if (result) {
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('email')
        expect(result).toHaveProperty('attributes')
      }
    })

    it('should handle contact not found error', async () => {
      const result = await getContactByExtId('999999')
      expect(result).toBeNull()
    })
  })
})
