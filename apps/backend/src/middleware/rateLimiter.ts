import { RateLimiterMemory } from 'rate-limiter-flexible'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

// Rate Limiting
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 }) // 10 requests per second
export const rateLimiterMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  rateLimiter
    .consume(req.ip ?? req.socket.remoteAddress ?? '0.0.0.0')
    .then(() => next())
    .catch(() => {
      res.status(429).json({ status: 429, title: 'Too many requests, slow down.' })
    })
}
