import type { Request, Response, NextFunction, RequestHandler } from 'express'
import ms from 'ms'
import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'

import logger from '../lib/logger.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import { MIKPermissions, toUserRole } from '../routes/members/models.ts'
import { problem, type Problem } from '../routes/response.ts'

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
      passReqToCallback: true,
    },
    async (req: Request, payload: JWTUser, callback) => {
      // allow UI to toggle admin permissions
      const isSudo = req.headers['x-sudo'] !== 'false'
      callback(undefined, {
        ...payload,
        permissions: isSudo ? payload.permissions : payload.permissions.map(toUserRole),
      })
    },
  ),
)

// Middlewares to authenticate and authorize users
export const validateUser = (...permissions: MIKPermissions[]): RequestHandler[] => [
  // first middleware validates the user
  passport.authenticate('jwt', { session: false }),

  // the second middleware validates the existence of roles
  (req: Request, res: Response<Problem>, next: NextFunction): void => {
    // If no roles are required, any valid user is fine
    if (!permissions.length) {
      return next()
    }

    // Check if user has any of the required roles
    if (permissions.some(p => req.user?.permissions?.includes(p))) {
      return next()
    }

    logger.warn(`Forbidden required: %j user: %j`, permissions, req.user)

    return problem({ status: 403, detail: 'Protected Content' })
  },
]
