import dotenv from 'dotenv'
dotenv.config()
import * as nodemailer from 'nodemailer'

import logger from './logger.ts'

// Check if SMTP_LOGIN and SMTP_PWD are present
const smtpLogin = process.env.SMTP_LOGIN
const smtpPwd = process.env.SMTP_PASSWORD

logger.info(process.env)

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

export const sendEmail = (to: string, subject: string, text: string, html: string): void => {
  const mailOptions = {
    from: smtpLogin, // Sender address
    to, // List of receivers
    subject,
    text,
    html,
  }

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error('Error occurred sending email to :', error)
      throw error
    } else {
      logger.info(`Login Email sent: to ${to} with response ${info.response}`)
    }
  })
}
