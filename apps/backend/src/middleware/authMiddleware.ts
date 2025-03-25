import type { Request, Response, NextFunction, RequestHandler } from 'express'
import ms from 'ms'
import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'

import logger from '../lib/logger.ts'
import type { JWTPayload } from '../routes/auth/token.ts'
import { MIKRoles } from '../routes/members/models.ts'
import type { ErrorResponse } from '../routes/response.ts'

//
// Passport strategy to authenticate the user with JWT tokens
// generated during the login process and passed in the Authorization header.
//
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.ACCESS_TOKEN_SECRET as ms.StringValue,
      issuer: 'mik',
      audience: 'api',
    },
    async (payload: JWTPayload, callback) => {
      callback(undefined, payload)
    },
  ),
)

// Middlewares to authenticate and authorize users
export const validateUser = (...roles: MIKRoles[]): RequestHandler[] => [
  // first middleware validates the user
  passport.authenticate('jwt', { session: false }),

  // the second middleware validates the existence of roles
  (req: Request, res: Response<ErrorResponse>, next: NextFunction): void => {
    // If no roles are required, any valid user is fine
    if (!roles.length) {
      return next()
    }

    // Super admins have access to everything
    if (req.user?.roles.includes(MIKRoles.ADMIN)) {
      return next()
    }

    // Check if user has any of the required roles
    if (roles.some(role => req.user?.roles.includes(role))) {
      return next()
    }

    logger.warn(`Forbidden required: %j user: %j`, roles, req.user)

    res.status(403).json({ errorCode: 'forbidden', message: 'Permission denied' })
  },
]
