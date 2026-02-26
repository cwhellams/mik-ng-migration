/**
 * Standalone route for tiny URL redirects
 * Handles both member documents and aircraft documents
 */
import { Router, type Request, type Response } from 'express'
//import { isValidShortCode } from '../services/tinyUrl.ts'
import { problem } from './response.ts'
import logger from '../lib/logger.ts'
import { getUrlByShortCode } from '../db/tiny-url-queries.ts'
import { isValidShortCode } from '../services/tinyUrl.ts'

export const router = Router()

// Redirect tiny URL to document download
router.get('/:code', async (req: Request<{ code: string }>, res: Response) => {
  const { code } = req.params

  if (!isValidShortCode(code)) {
    return problem({ status: 400, detail: 'Invalid short code format' })
  }

  // Validate short code format
  // if (!isValidShortCode(shortCode)) {
  //   return problem({ status: 400, detail: 'Invalid short code format' })
  // }

  const target = await getUrlByShortCode(code)

  if (!target) {
    logger.warn('Target URL not found for short code: %s', code)
    return problem({ status: 404, detail: 'Tiny URL not found' })
  }

  if (target.expires_at < new Date()) {
    logger.warn('Tiny URL expired for short code: %s', code)
    return problem({ status: 410, detail: 'Tiny URL has expired' })
  }

  logger.info('Redirecting short code %s to URL: %s', code, target.url)
  res.redirect(302, target.url)
})
