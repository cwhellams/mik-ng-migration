import { jest } from '@jest/globals'
import type { SentMessageInfo } from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer/index.js'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type { Logger } from 'winston'

import logger from '../../src/lib/logger.ts'

// Define the mock function first
const sendMailMock =
  jest.fn<
    (
      mailOptions: Mail.Options,
      callback: (err: Error | null, info?: SMTPTransport.SentMessageInfo) => void,
    ) => void
  >()

// Mock the nodemailer module
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: sendMailMock,
  }),
}))

const errorSpy = jest.spyOn(logger, 'error').mockImplementation((_infoObject: object) => {
  return {} as unknown as Logger
})

// Store original env
const originalEnv = process.env

describe('sendEmail', () => {
  let sendEmail: (to: string, subject: string, html: string) => void
  beforeAll(async () => {
    // Set credentials before module import so the module-level smtpLogin const
    // captures the test value (it is evaluated once at module load time).
    process.env.SMTP_LOGIN = 'test@example.com'
    process.env.SMTP_PASSWORD = 'password123'
    const module = await import('../../src/lib/sendGmail.ts')
    sendEmail = module.sendEmail
  })

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()

    // Setup environment variables
    process.env = {
      ...originalEnv,
      SMTP_LOGIN: 'test@example.com',
      SMTP_PASSWORD: 'password123',
      DISABLE_EMAIL_SENDING: undefined,
    }
  })

  afterEach(() => {
    // Restore original process.env
    process.env = originalEnv
  })

  test('should send email successfully', async () => {
    // Setup successful email sending response
    sendMailMock.mockImplementation((options, callback) => {
      callback(null, { response: '250 Message sent' } as SentMessageInfo)
    })

    // Test data
    const to = 'recipient@example.com'
    const subject = 'Test Subject'
    const html = '<p>Test HTML content</p>'

    // Call the function
    await sendEmail(to, subject, html)

    // Verify correct parameters are passed to sendMail
    expect(sendMailMock).toHaveBeenCalledWith(
      {
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
        attachments: undefined,
      },
      expect.any(Function),
    )
  })

  test('should throw error when email sending fails', () => {
    // Setup error case
    const testError = new Error('Failed to send email')
    sendMailMock.mockImplementation((_options, callback) => {
      callback(testError)
    })

    // Test data
    const to = 'recipient@example.com'
    const subject = 'Test Subject'
    const html = '<p>Test HTML content</p>'

    // Execute and expect error
    expect(() => {
      sendEmail(to, subject, html)
    }).toThrow('Failed to send email')

    // Verify logger.error was called
    expect(errorSpy).toHaveBeenCalled()
    // Check that error was logged with the test error
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error occurred sending email to : recipient@example.com with error'),
    )
  })

  test('should throw error when environment variables are missing', async () => {
    delete process.env.SMTP_LOGIN
    delete process.env.SMTP_PASSWORD

    expect(() => {
      sendEmail('recipient@example.com', 'Test Subject', '<p>Test HTML content</p>')
    }).toThrow('SMTP_LOGIN or SMTP_PASSWORD is not defined in environment variables')
  })
})
