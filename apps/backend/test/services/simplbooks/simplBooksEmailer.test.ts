import { jest } from '@jest/globals'
import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import type { EmailAttachment } from '../../../src/lib/sendGmail.ts'

// Mock the dependencies with proper typing
const getMemberById = jest.fn<() => Promise<Member | undefined>>()
const sendEmail =
  jest.fn<
    (
      to: string,
      subject: string,
      html: string,
      text: string,
      attachments?: EmailAttachment[],
    ) => void
  >()
const getInvoice = jest.fn<() => Promise<any>>()
const getInvoicePdf = jest.fn<() => Promise<string>>()

jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  getMemberById,
}))

jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail,
}))

jest.unstable_mockModule('../../../src/services/simplbooks/simplbooksApiClient.ts', () => ({
  getInvoice,
  getInvoicePdf,
}))

const { sendSimplbooksInvoiceEmail } = await import(
  '../../../src/services/simplbooks/simplBooksEmailer.ts'
)

describe('SimplBooks Emailer Tests', () => {
  const mockMember: Member = {
    memberId: 'test-member-123',
    memberType: MIKMemberTypes.FLYING,
    firstName: 'Test',
    lastName: 'User',
    streetAddress: '123 Test St',
    townCity: 'Helsinki',
    postcode: '00100',
    email: 'test@example.com',
    isTrainingProgramPilot: false,
    isMembershipApproved: true,
    canMakeReservations: true,
    lang: MIKLang.EN,
    memberSince: '2023-01-01',
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    roles: [],
  }

  const mockInvoice = {
    data: {
      Invoice: {
        id: 12345,
        client_id: 123,
        client_name: 'Test User',
        total_sum: '150.00',
        due: '2025-12-31',
        paid: '0000-00-00',
        reference: '12345678901',
        additional_info: 'Test invoice',
      },
      Task: [],
    },
  }

  const mockPdfBase64 =
    'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PmVuZG9iag=='

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('sendSimplbooksInvoiceEmail - Happy Path', () => {
    it('should send invoice email in English when member lang is EN', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => {})

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert
      expect(getMemberById).toHaveBeenCalledWith('test-member-123')
      expect(getInvoice).toHaveBeenCalledWith(12345)
      expect(getInvoicePdf).toHaveBeenCalledWith('12345')
      expect(sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'MIK New Invoice - 12345',
        expect.stringContaining('Test'), // Should contain firstName
        '',
        [
          {
            filename: 'mik_lasku_12345.pdf',
            content: mockPdfBase64,
            encoding: 'base64',
          },
        ],
      )
    })

    it('should send invoice email in Finnish when member lang is FI', async () => {
      // Arrange
      const finnishMember = { ...mockMember, lang: MIKLang.FI }
      getMemberById.mockResolvedValue(finnishMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => {})

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert
      expect(sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Malmin Ilmailukerhon lasku - 12345',
        expect.stringContaining('Test'), // Should contain firstName
        '',
        [
          {
            filename: 'mik_lasku_12345.pdf',
            content: mockPdfBase64,
            encoding: 'base64',
          },
        ],
      )
    })

    it('should include invoice details in email variables', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => {})

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert
      const emailHtml = sendEmail.mock.calls[0][2]
      expect(emailHtml).toContain('Test') // firstName
      expect(emailHtml).toContain('150.00') // amount
      expect(emailHtml).toContain('2025-12-31') // dueDate
    })
  })

  describe('sendSimplbooksInvoiceEmail - Error Cases', () => {
    it('should throw error when member is not found', async () => {
      // Arrange
      getMemberById.mockResolvedValue(undefined)

      // Act & Assert
      await expect(sendSimplbooksInvoiceEmail(12345, 'non-existent-member')).rejects.toThrow(
        'Member with ID non-existent-member not found',
      )
    })

    it('should throw error when invoice is not found', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue({ data: {} } as any)

      // Act & Assert
      await expect(sendSimplbooksInvoiceEmail(12345, 'test-member-123')).rejects.toThrow(
        'Invoice with ID 12345 not found',
      )
    })

    it('should throw error when PDF data is invalid (not a string)', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue({ data: 'pdf' } as any)

      // Act & Assert
      await expect(sendSimplbooksInvoiceEmail(12345, 'test-member-123')).rejects.toThrow(
        'Invalid PDF data received for invoice 12345',
      )
    })

    it('should throw error when PDF data is empty', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue('')

      // Act & Assert
      await expect(sendSimplbooksInvoiceEmail(12345, 'test-member-123')).rejects.toThrow(
        'Invalid PDF data received for invoice 12345',
      )
    })

    it('should throw error when PDF data is null', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(null as any)

      // Act & Assert
      await expect(sendSimplbooksInvoiceEmail(12345, 'test-member-123')).rejects.toThrow(
        'Invalid PDF data received for invoice 12345',
      )
    })
  })

  describe('sendSimplbooksInvoiceEmail - Attachment Format', () => {
    it('should create attachment with correct format', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => {})

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert
      const attachments = sendEmail.mock.calls[0][4]
      expect(attachments).toHaveLength(1)
      expect(attachments![0]).toEqual({
        filename: 'mik_lasku_12345.pdf',
        content: mockPdfBase64,
        encoding: 'base64',
      })
    })
  })
})
