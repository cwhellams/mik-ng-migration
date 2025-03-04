import { Request, Response, NextFunction } from 'express'
const jwt = require('jsonwebtoken')
import { User, Role } from '../types/common'

// Extend Express Request type
declare module 'express' {
  interface Request {
    user?: User
  }
}

// Middleware with role checks
const authMiddleware =
  (requiredRoles: string[] = []) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract the token from the Authorization header
      const authHeader = req.header('Authorization')

      if (!authHeader?.startsWith('Bearer ')) {
        return res
          .status(401)
          .send({ error: 'Authorization header missing or malformed' })
      }

      const token = authHeader.replace('Bearer ', '')

      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        maxAge: '1h',
      })

      const user = undefined // TODO: Implement user lookup with decoded.userId

      if (!user) {
        return res.status(401).send({ error: 'User not found' })
      }

      // If no roles are required, just validate the session and move on
      if (!requiredRoles.length) {
        req.user = user
        return next()
      }

      // Helper function to check if the user is a board member
      const isBoardMember = (user: User) => {
        return user.roles.some((role: Role) => role.name === 'board_member')
      }

      // Helper function to check if the user is a super admin
      const isSuperAdmin = (user: User) => {
        return user.roles.some((role: Role) => role.name === 'super_admin')
      }

      // Super admins have access to everything
      if (isSuperAdmin(user)) {
        req.user = user
        return next()
      }

      // Check if user has any of the required roles
      const hasRequiredRole = requiredRoles.some((requiredRole) =>
        user.roles.some((userRole: Role) => userRole.name === requiredRole)
      )

      if (hasRequiredRole) {
        req.user = user
        return next()
      }

      return res.status(403).send({
        error: 'Forbidden: You do not have the necessary access rights',
      })
    } catch (error: any) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).send({ errorCode: 'invalid_token' })
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).send({ errorCode: 'token_expired' })
      }

      res.status(500).send({ error: 'Internal server error' })
    }
  }

module.exports = authMiddleware
