import { Request, Response, NextFunction, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

import logger from '../lib/logger'
import { JWTPayload, JWTPayloadSchema, MIKRoles } from '../routes/auth/tokens'
import { ErrorResponse } from '../routes/response'

// Extend Express Request type
declare module 'express' {
  interface Request {
    user?: JWTPayload
  }
}

const JWT_SECRET = process.env.JWT_SECRET as string
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables')
}

// Middleware with role checks
export const authMiddleware =
  (...requiredRoles: MIKRoles[]): RequestHandler =>
  async (req: Request, res: Response<ErrorResponse>, next: NextFunction) => {
    try {
      // Extract the token from the Authorization header
      const authHeader = req.header('Authorization')

      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ errorCode: 'invalid_token' })
      }

      const token = authHeader.replace('Bearer ', '')

      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        maxAge: '1h',
      })

      logger.info('Decoded token:', decoded)

      const user = JWTPayloadSchema.parse(decoded)

      // If no roles are required, just validate the session and move on
      if (!requiredRoles.length) {
        req.user = user
        return next()
      }

      // Super admins have access to everything
      if (user.roles.includes(MIKRoles.ADMIN)) {
        req.user = user
        return next()
      }

      // Check if user has any of the required roles
      if (requiredRoles.some(role => user.roles.includes(role))) {
        req.user = user
        return next()
      }

      return res.status(403).json({
        message: 'Forbidden: You do not have the necessary access rights',
      })
    } catch (error: any) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ errorCode: 'invalid_token' })
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ errorCode: 'token_expired' })
      }

      console.error(error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }
