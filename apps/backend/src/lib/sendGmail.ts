import 'dotenv/config'
import * as nodemailer from 'nodemailer'
import validator from 'validator'

import logger from './logger.ts'

let transporter: nodemailer.Transporter | undefined
let transporterAuth:
  | {
      user: string
      pass: string
    }
  | undefined

if (process.env.DISABLE_EMAIL_SENDING) {
  console.log(`Email sending is disabled: ${process.env.DISABLE_EMAIL_SENDING}`)
}

export interface EmailAttachment {
  filename: string
  content?: string | Buffer // Content of the attachment
  path?: string // File path or URL
  contentType?: string // MIME type
  encoding?: string // 'base64' | 'hex' | 'binary' etc.
  cid?: string // Content-ID for inline images (referenced as cid:<value> in HTML)
  contentDisposition?: 'inline' | 'attachment'
}

const getTransporter = (smtpLogin: string, smtpPwd: string): nodemailer.Transporter => {
  if (!transporter || transporterAuth?.user !== smtpLogin || transporterAuth?.pass !== smtpPwd) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpLogin,
        pass: smtpPwd,
      },
    })
    transporterAuth = {
      user: smtpLogin,
      pass: smtpPwd,
    }
  }

  return transporter
}

export const sendEmail = (
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
  replyTo?: string,
): Promise<void> => {
  // Validate email address to prevent injection attacks
  if (!validator.isEmail(to)) {
    logger.error(`Invalid email address: ${to}`)
    return Promise.reject(new Error('Invalid email address'))
  }

  // Sanitize subject to prevent header injection
  const sanitizedSubject = subject.replace(/[\r\n]/g, '')

  // Note: HTML content should already be sanitized by email template functions
  // that use escapeHtml() and validateUrl(). This is a defense-in-depth check.
  // We don't re-escape here as it would double-escape already safe content.

  const disableEmailSending = process.env.DISABLE_EMAIL_SENDING
    ? // disabled completely or not whitelisted
      process.env.DISABLE_EMAIL_SENDING.toLocaleLowerCase() === 'true' ||
      process.env.DISABLE_EMAIL_SENDING === '1' ||
      !process.env.DISABLE_EMAIL_SENDING.split(',').includes(to)
    : false
  if (disableEmailSending) {
    logger.info(`Email sending is disabled. Email not sent to ${to}`)
    return Promise.resolve()
  }

  const smtpLogin = process.env.SMTP_LOGIN
  const smtpPwd = process.env.SMTP_PASSWORD
  if (!smtpLogin || !smtpPwd) {
    return Promise.reject(
      new Error('SMTP_LOGIN or SMTP_PASSWORD is not defined in environment variables'),
    )
  }

  const transporter = getTransporter(smtpLogin, smtpPwd)

  // Set up email data
  const mailOptions = {
    from: smtpLogin, // Sender address
    to, // List of receivers
    subject: sanitizedSubject,
    html,
    attachments, // Add attachments if provided
    replyTo: replyTo && validator.isEmail(replyTo) ? replyTo : undefined,
  }

  // Send email - wrap callback in a Promise so callers can await delivery success/failure
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        logger.error(`Error occurred sending email to : ${to} with error ${error.message}`)
        reject(error)
      } else {
        logger.info(`Email sent: to ${to} with response ${info.response}`)
        resolve()
      }
    })
  })
}
