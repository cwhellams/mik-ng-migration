import { RateLimiterMemory } from 'rate-limiter-flexible'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { readAccessToken } from '../routes/auth/cookies.ts'

// Increased limit to 40 points in 3 seconds to accommodate dashboard parallel requests.
// Dashboard can fire 25-35+ parallel requests on load, which was exceeding the previous
// 30-point limit and causing legitimate users to hit 429 errors.
const rateLimiter = new RateLimiterMemory({ points: 40, duration: 3 })

// Safe metadata endpoints that should not count against rate limit
const EXEMPT_PATHS = ['/health', '/api/v1/version', '/api/v1/time']

export const rateLimiterMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Skip rate limiting for exempt paths (metadata endpoints)
  if (EXEMPT_PATHS.includes(req.path)) {
    return next()
  }

  // Skip rate limiting for OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return next()
  }

  const unauthenticated = !readAccessToken(req)

  // Calculate points to consume based on authentication and request type:
  // - Unauthenticated users: 3 points (limiting to ~13 requests in 3 seconds)
  // - Authenticated GET requests: 0.5 points (read operations, dashboard-heavy)
  // - Authenticated write requests: 2 points (POST/PUT/PATCH/DELETE are higher risk)
  let pointsToConsume: number
  if (unauthenticated) {
    pointsToConsume = 3
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    // GET/HEAD requests consume less since they're read-only and dashboard makes many parallel calls
    pointsToConsume = 0.5
  } else {
    // POST/PUT/PATCH/DELETE consume more points as they modify state
    pointsToConsume = 2
  }

  rateLimiter
    .consume(req.ip ?? req.socket.remoteAddress ?? '0.0.0.0', pointsToConsume)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ status: 429, title: 'Too many requests, slow down.' })
    })
}
