import { RateLimiterMemory } from 'rate-limiter-flexible'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

// Allow small bursts, max 30 requests in 3 seconds window
const rateLimiter = new RateLimiterMemory({ points: 30, duration: 3 })
export const rateLimiterMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.headers['x-mik-migration']) {
    // Allow migration requests to bypass rate limiting
    return next()
  }

  const unauthenticated = !req.headers.authorization

  // Unauthenticated users consume 3x more points,
  // limiting to 10 request in 3 seconds window.
  //
  const pointsToConsume = unauthenticated ? 3 : 1

  rateLimiter
    .consume(req.ip ?? req.socket.remoteAddress ?? '0.0.0.0', pointsToConsume)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ status: 429, title: 'Too many requests, slow down.' })
    })
}
