import { google } from 'googleapis'

import { sendEmail } from '../../src/lib/sendGmail.ts'

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockReturnValue({
        setCredentials: jest.fn(),
      }),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          send: jest.fn(),
        },
      },
    }),
  },
}))

describe('sendEmail', () => {
  const recipient = 'test@example.com'
  const subject = 'Test Subject'
  const body = 'Test Body'

  const auth = new google.auth.OAuth2()
  const sendSpy = jest
    .spyOn(google.gmail({ version: 'v1', auth }).users.messages, 'send')
    .mockImplementation(async () => Promise.resolve({ data: 'mocked response' }))

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should send an email successfully', async () => {
    const response = await sendEmail(recipient, subject, body)

    expect(sendSpy).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { raw: expect.any(String) },
    })

    expect(google.gmail).toHaveBeenCalledWith({
      version: 'v1',
      auth: auth,
    })

    expect(sendSpy).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { raw: expect.any(String) },
    })
    expect(response).toEqual('mocked response')
  })

  it('should throw an error if sending email fails', async () => {
    sendSpy.mockImplementation(async () => Promise.reject(new Error('Failed to send email')))

    await expect(sendEmail(recipient, subject, body)).rejects.toThrow('Failed to send email')
  })
})
