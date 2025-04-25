import { jest } from '@jest/globals'
import type { SentMessageInfo } from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer/index.js'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type { Logger } from 'winston'

import logger from '../../src/lib/logger.ts'

process.env.SMTP_LOGIN = 'no-reply@mik.fi'
process.env.SMTP_PASSWORD = 'test'

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
        from: 'no-reply@mik.fi',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
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
      expect.stringContaining('Error occurred sending email'),
      testError,
    )
  })

  test('should throw error when environment variables are missing', async () => {
    // First completely reset modules to ensure no cached modules
    jest.resetModules()

    // Mock dotenv to avoid reading .env file
    jest.mock('dotenv/config', () => ({}))

    // Remove required environment variables
    const modifiedEnv = { ...process.env }
    delete modifiedEnv.SMTP_LOGIN
    delete modifiedEnv.SMTP_PASSWORD

    // Set the modified environment
    process.env = modifiedEnv

    // Try to import the module and expect it to throw
    await expect(async () => {
      await jest.isolateModulesAsync(async () => {
        await import('../../src/lib/sendGmail.ts')
      })
    }).rejects.toThrow('SMTP_LOGIN or SMTP_PASSWORD is not defined')
  })
})
