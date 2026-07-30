import { jest } from '@jest/globals'
import { MIKLang, MIKMemberTypes, type Member } from '../../../src/routes/members/models.ts'
import type { EmailAttachment } from '../../../src/lib/sendGmail.ts'

// Mock the dependencies with proper typing
const getMemberById = jest.fn<(...args: any[]) => Promise<Member | undefined>>()
const sendEmail =
  jest.fn<
    (to: string, subject: string, html: string, attachments?: EmailAttachment[]) => Promise<void>
  >()
const getInvoice = jest.fn<(...args: any[]) => Promise<any>>()
const getInvoicePdf = jest.fn<(...args: any[]) => Promise<string>>()
const markInvoiceAsSent = jest.fn<(...args: any[]) => Promise<void>>()

jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  getMemberById,
}))

jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail,
}))

jest.unstable_mockModule('../../../src/services/simplbooks/simplbooksApiClient.ts', () => ({
  getInvoice,
  getInvoicePdf,
  markInvoiceAsSent,
}))

const { sendSimplbooksInvoiceEmail } =
  await import('../../../src/services/simplbooks/simplBooksEmailer.ts')

describe('SimplBooks Emailer Tests', () => {
  const mockMember: Member = {
    memberId: 'test-member-123',
    memberType: MIKMemberTypes.FLYING,
    firstName: 'Test',
    lastName: 'User',
    streetAddress: '123 Test St',
    townCity: 'Helsinki',
    country: 'FI',
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
    autoRenewAnnualMembership: true,
    autoRenewEquipmentFee: false,
    isMembershipExpired: false,
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
      sendEmail.mockImplementation(() => Promise.resolve())

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
        expect.arrayContaining([
          {
            filename: 'mik_lasku_12345.pdf',
            content: mockPdfBase64,
            encoding: 'base64',
          },
        ]),
      )
    })

    it('should send invoice email in Finnish when member lang is FI', async () => {
      // Arrange
      const finnishMember = { ...mockMember, lang: MIKLang.FI }
      getMemberById.mockResolvedValue(finnishMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => Promise.resolve())

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert
      expect(sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Malmin Ilmailukerhon lasku - 12345',
        expect.stringContaining('Test'), // Should contain firstName
        expect.arrayContaining([
          {
            filename: 'mik_lasku_12345.pdf',
            content: mockPdfBase64,
            encoding: 'base64',
          },
        ]),
      )
    })

    it('should include invoice details in email variables', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => Promise.resolve())

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert
      const emailHtml = sendEmail.mock.calls[0][2]
      expect(emailHtml).toContain('Test') // firstName
      expect(emailHtml).toContain('150.00') // amount
      expect(emailHtml).toContain('2025-12-31') // dueDate
    })

    it('should include formatted reference number in email when reference is present', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => Promise.resolve())

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert: reference 12345678901 should be formatted as "1 23456 78901"
      const emailHtml = sendEmail.mock.calls[0][2]
      expect(emailHtml).toContain('1 23456 78901')
    })

    it('should include Finnish banking barcode in email', async () => {
      // Arrange
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(mockInvoice as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => Promise.resolve())

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert: email should contain a 54-character barcode string
      const emailHtml = sendEmail.mock.calls[0][2]
      expect(emailHtml).toMatch(/[0-9]{54}/)

      // Assert: email should contain a Code 128 Set C barcode PNG image via CID
      expect(emailHtml).toContain('cid:barcode-12345@mik.fi')
      expect(emailHtml).toContain('<img src="cid:barcode-12345@mik.fi"')
      // Assert: barcode CID attachment is included
      const attachments = sendEmail.mock.calls[0][3]!
      const barcodeAttachment = attachments.find(
        (a: EmailAttachment) => a.cid === 'barcode-12345@mik.fi',
      )
      expect(barcodeAttachment).toBeDefined()
      expect(barcodeAttachment?.contentType).toBe('image/png')
      expect(barcodeAttachment?.contentDisposition).toBe('inline')
    })

    it('should send email without barcode when reference is missing', async () => {
      // Arrange
      const invoiceWithoutReference = {
        data: {
          Invoice: { ...mockInvoice.data.Invoice, reference: null },
          Task: [],
        },
      }
      getMemberById.mockResolvedValue(mockMember)
      getInvoice.mockResolvedValue(invoiceWithoutReference as any)
      getInvoicePdf.mockResolvedValue(mockPdfBase64)
      sendEmail.mockImplementation(() => Promise.resolve())

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert: email should still be sent successfully but without barcode
      expect(sendEmail).toHaveBeenCalled()
      const emailHtml = sendEmail.mock.calls[0][2]
      expect(emailHtml).not.toMatch(/[0-9]{54}/)
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
      sendEmail.mockImplementation(() => Promise.resolve())

      // Act
      await sendSimplbooksInvoiceEmail(12345, 'test-member-123')

      // Assert: PDF attachment has correct format
      const attachments = sendEmail.mock.calls[0][3]
      const pdfAttachment = attachments!.find(
        (a: EmailAttachment) => a.filename === 'mik_lasku_12345.pdf',
      )
      expect(pdfAttachment).toEqual({
        filename: 'mik_lasku_12345.pdf',
        content: mockPdfBase64,
        encoding: 'base64',
      })
      // Assert: barcode and QR code are inline CID attachments
      const barcodeAttachment = attachments!.find(
        (a: EmailAttachment) => a.cid === 'barcode-12345@mik.fi',
      )
      expect(barcodeAttachment).toMatchObject({
        filename: 'barcode.png',
        contentType: 'image/png',
        cid: 'barcode-12345@mik.fi',
        contentDisposition: 'inline',
      })
      const qrAttachment = attachments!.find(
        (a: EmailAttachment) => a.cid === 'qrcode-12345@mik.fi',
      )
      expect(qrAttachment).toMatchObject({
        filename: 'qrcode.png',
        contentType: 'image/png',
        cid: 'qrcode-12345@mik.fi',
        contentDisposition: 'inline',
      })
    })
  })
})
