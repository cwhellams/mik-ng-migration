// Define the mock function first
const sendMailMock = jest.fn()
const loggerMock = {
  info: jest.fn(),
  error: jest.fn(),
}

// Mock the nodemailer module
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: sendMailMock,
  }),
}))

// Mock the logger
jest.mock('../../src/lib/logger', () => loggerMock)

// Store original env
const originalEnv = process.env

describe('sendEmail', () => {
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

  test('should send email successfully', () => {
    // Setup successful email sending response
    sendMailMock.mockImplementation((options, callback) => {
      callback(null, { response: '250 Message sent' })
    })

    // Reset modules to ensure clean import with our mocks in place
    jest.resetModules()

    // Import the module under test AFTER setting up mocks
    const { sendEmail } = require('../../src/lib/sendGmail')

    // Test data
    const to = 'recipient@example.com'
    const subject = 'Test Subject'
    const html = '<p>Test HTML content</p>'

    // Call the function
    sendEmail(to, subject, html)

    // Verify correct parameters are passed to sendMail
    expect(sendMailMock).toHaveBeenCalledWith(
      {
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
      },
      expect.any(Function),
    )

    expect(loggerMock.info).toHaveBeenCalled()
  })

  test('should throw error when email sending fails', () => {
    // Setup error case
    const testError = new Error('Failed to send email')
    sendMailMock.mockImplementation((options, callback) => {
      callback(testError, null)
    })

    // Reset modules to ensure clean import with our mocks in place
    jest.resetModules()

    // Import the module under test AFTER setting up mocks
    const { sendEmail } = require('../../src/lib/sendGmail')

    // Test data
    const to = 'recipient@example.com'
    const subject = 'Test Subject'
    const text = 'Test plain text'
    const html = '<p>Test HTML content</p>'

    // Execute and expect error
    expect(() => {
      sendEmail(to, subject, text, html)
    }).toThrow('Failed to send email')

    // Verify logger.error was called
    expect(loggerMock.error).toHaveBeenCalled()
    // Check that error was logged with the test error
    expect(loggerMock.error.mock.calls[0][0]).toContain('Error occurred sending email')
    expect(loggerMock.error.mock.calls[0][1]).toBe(testError)
  })

  test('should throw error when environment variables are missing', () => {
    // First completely reset modules to ensure no cached modules
    jest.resetModules()

    // Mock dotenv to avoid reading .env file
    jest.mock('dotenv', () => ({
      config: jest.fn(),
    }))

    // Remove required environment variables
    const modifiedEnv = { ...process.env }
    delete modifiedEnv.SMTP_LOGIN
    delete modifiedEnv.SMTP_PASSWORD

    // Set the modified environment
    process.env = modifiedEnv

    // Try to import the module and expect it to throw
    expect(() => {
      jest.isolateModules(() => {
        require('../../src/lib/sendGmail.ts')
      })
    }).toThrow('SMTP_LOGIN or SMTP_PASSWORD is not defined')
  })
})
