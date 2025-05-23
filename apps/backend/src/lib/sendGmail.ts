import 'dotenv/config'
import * as nodemailer from 'nodemailer'

import logger from './logger.ts'

const smtpLogin = process.env.SMTP_LOGIN
const smtpPwd = process.env.SMTP_PASSWORD

// Check if SMTP_LOGIN and SMTP_PWD are present
if (!smtpLogin || !smtpPwd) {
  throw new Error('SMTP_LOGIN or SMTP_PASSWORD is not defined in environment variables')
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: smtpLogin,
    pass: smtpPwd,
  },
})

export const sendEmail = (to: string, subject: string, html: string, text: string): void => {
  const disableEmailSending: boolean =
    process.env.DISABLE_EMAIL_SENDING?.toLocaleLowerCase() === 'true' ||
    process.env.DISABLE_EMAIL_SENDING === '1'

  if (disableEmailSending) {
    logger.info(`Email sending is disabled. Email not sent to ${to}`)
    return
  }

  // Set up email data
  const mailOptions = {
    from: smtpLogin, // Sender address
    to, // List of receivers
    subject,
    html,
    text,
  }

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error(`Error occurred sending email to : ${to} with error ${error.message}`)
      throw error
    } else {
      logger.info(`Login Email sent: to ${to} with response ${info.response}`)
    }
  })
}
