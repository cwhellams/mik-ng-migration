import { gmail_v1, google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

//Get Google workspace creds from the environment
const { WORKSPACE_EMAIL_CLIENT_ID, WORKSPACE_EMAIL_CLIENT_SECRET, EMAIL_USER } =
  process.env

if (
  !WORKSPACE_EMAIL_CLIENT_ID ||
  !WORKSPACE_EMAIL_CLIENT_SECRET ||
  !EMAIL_USER
) {
  throw new Error('❌ Missing required environment variables for Email sender!')
}

// OAuth2 Client setup
const oAuth2Client = new google.auth.OAuth2(
  WORKSPACE_EMAIL_CLIENT_ID,
  WORKSPACE_EMAIL_CLIENT_SECRET
)

/**
 * Encodes an email message in Base64 (RFC 2822 format)
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param body - Email body
 * @returns Base64 encoded string
 */
function createEmailMessage(to: string, subject: string, body: string): string {
  const email = [
    `From: ${EMAIL_USER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n')

  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

}

/**
 * Sends an email using the Gmail API
 */
export const sendEmail = async (
  recipient: string,
  subject: string,
  body: string
): Promise<gmail_v1.Schema$Message> => {
  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client })
    const rawMessage = createEmailMessage(recipient, subject, body)

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage },
    })

    return response.data
  } catch (error: any) {
    throw new Error(error?.response?.data?.error || 'Failed to send email')
  }
}
