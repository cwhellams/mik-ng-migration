import type { Request, Response, NextFunction, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

import logger from '../lib/logger.ts'
import { API_AUD, MIK_ISS, type JWTUser } from '../routes/auth/token.ts'
import { readAccessToken } from '../routes/auth/cookies.ts'
import { MIKPermissions, downgradePermission } from '@mik/contracts/members'
import type { Problem } from '@mik/contracts/problem'

import { problem } from '../routes/response.ts'

// Middleware to authenticate and authorize user
export const validateUser = (...permissions: MIKPermissions[]): RequestHandler[] => [
  // first middleware validates the JWT from the httpOnly cookie
  (req: Request, res: Response<Problem>, next: NextFunction): void => {
    const token = readAccessToken(req)
    if (!token) {
      return problem({ status: 401, detail: 'Unauthorized' })
    }
    try {
      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, {
        issuer: MIK_ISS,
        audience: API_AUD,
      }) as JWTUser

      // allow UI to toggle admin permissions
      const isSudo = req.headers['x-sudo'] !== 'false'
      req.user = {
        ...payload,
        permissions: isSudo
          ? payload.permissions
          : payload.permissions
              .map(downgradePermission)
              .filter((p): p is MIKPermissions => p !== undefined),
      }
      next()
    } catch {
      return problem({ status: 401, detail: 'Unauthorized' })
    }
  },

  // second middleware validates the required permissions
  (req: Request, res: Response<Problem>, next: NextFunction): void => {
    // If no permissions are required, any valid user is fine
    if (!permissions.length) {
      return next()
    }

    // Check if user has any of the required permissions
    if (permissions.some((p) => req.user?.permissions?.includes(p))) {
      return next()
    }

    logger.warn(`Forbidden required: %j user: %j`, permissions, req.user)

    return problem({ status: 403, detail: 'Protected Content' })
  },
]
