import { Router, type Request, type Response } from 'express'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { ContactRequestSchema } from '@mik/contracts/contact'
import { sendEmail } from '../../lib/sendGmail.ts'
import { renderEmail } from '../../templates/renderEmail.ts'
import { getContactRecipient } from '../../services/contact/contactRecipients.ts'
import { verifyTurnstileToken } from '../../services/turnstile.ts'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

// Per-email: 3 requests per hour
const contactEmailLimiter = new RateLimiterMemory({ points: 3, duration: 60 * 60 })
// Per-IP: 10 requests per hour
const contactIpLimiter = new RateLimiterMemory({ points: 10, duration: 60 * 60 })

export const router = Router()

router.post('/contact', async (req: Request, res: Response) => {
  const { name, email, category, message, lang, turnstileToken } = ContactRequestSchema.parse(
    req.body,
  )

  if (process.env.TURNSTILE_ENABLED === 'true' && !turnstileToken) {
    return problem({ status: 400, detail: 'Captcha verification is required' })
  }

  if (turnstileToken) {
    const isValid = await verifyTurnstileToken(turnstileToken, req.ip)
    if (!isValid) {
      logger.warn('Contact form attempt with invalid Turnstile token from %s', req.ip)
      return problem({ status: 400, detail: 'Invalid captcha verification' })
    }
  }

  const clientIp = req.ip ?? 'unknown'
  try {
    await contactEmailLimiter.consume(email.toLowerCase())
  } catch {
    logger.warn('Contact rate limit (email) exceeded from %s', email)
    return problem({ status: 429, detail: 'Too many requests. Please try again later.' })
  }
  try {
    await contactIpLimiter.consume(clientIp)
  } catch {
    logger.warn('Contact rate limit (IP) exceeded from %s', clientIp)
    return problem({ status: 429, detail: 'Too many requests. Please try again later.' })
  }

  const recipient = getContactRecipient(category)

  const notificationMail = renderEmail('contact-request', 'en', {
    name,
    email,
    category,
    message: message.split('\n'),
  })
  sendEmail(recipient, notificationMail.subject, notificationMail.html, undefined, email).catch(
    (err) => logger.error('Failed to send contact notification email to %s: %s', recipient, err),
  )

  const ackMail = renderEmail('contact-received', lang, { name, category })
  sendEmail(email, ackMail.subject, ackMail.html).catch((err) =>
    logger.error('Failed to send contact acknowledgement email to %s: %s', email, err),
  )

  logger.info('Contact form submission from %s (%s) to %s', email, category, recipient)

  return res.status(204).send()
})
