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

export const sendEmail = async (to: string, subject: string, text: string, html: string): Promise<boolean> => {
  const mailOptions = {
    from: smtpLogin, // Sender address
    to, // List of receivers
    subject,
    text,
    html,
  }

  // Convert callback-based sendMail to Promise-based for better error handling
  try {
    const info = await new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          reject(error);
        } else {
          resolve(info);
        }
      });
    });

    logger.info(`Login Email sent: to ${to} with response ${(info as any).response}`);
    return true;
  } catch (error: any) {
    // Check for specific SMTP authentication errors
    if (error.code === 'EAUTH' || error.message.includes('authentication failed')) {
      logger.error('SMTP authentication failed. Please check your credentials:', error);
    } else {
      logger.error('Error occurred sending email to:', to, error);
    }

    // Return false instead of throwing so the application can continue
    return false;
  }
}
