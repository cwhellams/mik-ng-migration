import logger from '../lib/logger.ts'

interface TurnstileVerificationResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
}

/**
 * Verify Cloudflare Turnstile token
 * @param token The turnstile token from the client
 * @param remoteIp Optional: the user's IP address
 * @returns true if verification succeeds, false otherwise
 */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const turnstileEnabled = process.env.TURNSTILE_ENABLED === 'true'
  const secretKey = process.env.TURNSTILE_SECRET_KEY

  // If Turnstile is disabled (e.g., for local development), skip verification
  if (!turnstileEnabled) {
    logger.debug('Turnstile verification skipped (disabled)')
    return true
  }

  // If no secret key is configured, log warning and fail closed
  if (!secretKey) {
    logger.warn('TURNSTILE_SECRET_KEY not configured, but TURNSTILE_ENABLED=true')
    return false
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey)
    formData.append('response', token)
    if (remoteIp) {
      formData.append('remoteip', remoteIp)
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    })

    if (!response.ok) {
      logger.error('Turnstile API returned non-OK status: %d', response.status)
      return false
    }

    const data = (await response.json()) as TurnstileVerificationResponse

    if (!data.success) {
      logger.warn('Turnstile verification failed: %j', data['error-codes'])
      return false
    }

    logger.info('Turnstile verification succeeded')
    return true
  } catch (error) {
    logger.error('Error verifying Turnstile token: %j', error)
    return false
  }
}
