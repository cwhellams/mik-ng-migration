import { jest } from '@jest/globals'
import type { Logger } from 'winston'

// Mock nodemailer to prevent actual sending
const sendMailMock = jest.fn()
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: sendMailMock,
  }),
}))

describe('sendEmail with DISABLE_EMAIL_SENDING=true', () => {
  beforeAll(() => {
    jest.resetModules()
    jest.clearAllMocks()

    process.env.SMTP_LOGIN = 'no-reply@mik.fi'
    process.env.SMTP_PASSWORD = 'test'
    process.env.DISABLE_EMAIL_SENDING = 'true'
  })

  afterAll(() => {
    delete process.env.DISABLE_EMAIL_SENDING
  })

  it('should skip sending and log that email is disabled', async () => {
    // Spy on logger.info
    await jest.isolateModulesAsync(async () => {
      const logger = await import('../../src/lib/logger.ts')
      const infoSpy = jest
        .spyOn(logger.default, 'info')
        .mockImplementation(() => logger.default as unknown as Logger)

      const { sendEmail } = await import('../../src/lib/sendGmail.ts')
      sendEmail('recipient@example.com', 'Subject', '<p>HTML</p>')
      expect(infoSpy).toHaveBeenCalledWith(
        'Email sending is disabled. Email not sent to recipient@example.com',
      )
      expect(sendMailMock).not.toHaveBeenCalled()
    })
  })

  it('should skip sending when disabled even without SMTP credentials', async () => {
    await jest.isolateModulesAsync(async () => {
      const logger = await import('../../src/lib/logger.ts')
      const infoSpy = jest
        .spyOn(logger.default, 'info')
        .mockImplementation(() => logger.default as unknown as Logger)

      const previousSmtpLogin = process.env.SMTP_LOGIN
      const previousSmtpPassword = process.env.SMTP_PASSWORD
      const previousDisableEmailSending = process.env.DISABLE_EMAIL_SENDING

      try {
        delete process.env.SMTP_LOGIN
        delete process.env.SMTP_PASSWORD
        process.env.DISABLE_EMAIL_SENDING = 'true'

        const { sendEmail } = await import('../../src/lib/sendGmail.ts')
        expect(() => sendEmail('recipient@example.com', 'Subject', '<p>HTML</p>')).not.toThrow()
        expect(infoSpy).toHaveBeenCalledWith(
          'Email sending is disabled. Email not sent to recipient@example.com',
        )
        expect(sendMailMock).not.toHaveBeenCalled()
      } finally {
        if (previousSmtpLogin === undefined) {
          delete process.env.SMTP_LOGIN
        } else {
          process.env.SMTP_LOGIN = previousSmtpLogin
        }

        if (previousSmtpPassword === undefined) {
          delete process.env.SMTP_PASSWORD
        } else {
          process.env.SMTP_PASSWORD = previousSmtpPassword
        }

        if (previousDisableEmailSending === undefined) {
          delete process.env.DISABLE_EMAIL_SENDING
        } else {
          process.env.DISABLE_EMAIL_SENDING = previousDisableEmailSending
        }
      }
    })
  })

  it('should skip sending emails outside whitelist and log that email is disabled', async () => {
    // Spy on logger.info
    await jest.isolateModulesAsync(async () => {
      const logger = await import('../../src/lib/logger.ts')
      const infoSpy = jest
        .spyOn(logger.default, 'info')
        .mockImplementation(() => logger.default as unknown as Logger)

      process.env.DISABLE_EMAIL_SENDING = 'recipient@example.com,recipient2@example.com'

      const { sendEmail } = await import('../../src/lib/sendGmail.ts')
      sendEmail('recipient3@example.com', 'Subject', '<p>HTML</p>')
      expect(infoSpy).toHaveBeenCalledWith(
        'Email sending is disabled. Email not sent to recipient3@example.com',
      )
      expect(sendMailMock).not.toHaveBeenCalled()
    })
  })

  it('should sending emails to whitelistd email', async () => {
    // Spy on logger.info
    await jest.isolateModulesAsync(async () => {
      const logger = await import('../../src/lib/logger.ts')
      const infoSpy = jest
        .spyOn(logger.default, 'info')
        .mockImplementation(() => logger.default as unknown as Logger)

      process.env.DISABLE_EMAIL_SENDING = 'recipient@example.com,recipient2@example.com'

      const { sendEmail } = await import('../../src/lib/sendGmail.ts')
      sendEmail('recipient2@example.com', 'Subject', '<p>HTML</p>')
      expect(infoSpy).toHaveBeenCalledTimes(0)
      expect(sendMailMock).toHaveBeenCalled()
    })
  })
})
