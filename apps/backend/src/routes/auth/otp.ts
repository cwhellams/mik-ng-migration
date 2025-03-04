import { Router, Request, Response, NextFunction } from 'express'
import { generateAccessToken, generateRefreshToken } from '../../lib/tokens'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import sendSESEmail from '../../lib/sendSESEmail'
import crypto from 'crypto'
import generateOTP from '../../lib/generateOTP'

const router = Router()

interface OTPRequestBody {
  email: string
}

interface OTPVerifyBody {
  email: string
  otp: string
}

interface StoredToken {
  token: string
  expiresAt: Date
}

interface JWTPayload {
  userId: string
  sessionId: string
}

router.post(
  '/request-otp',
  async (
    req: Request<{}, {}, OTPRequestBody, Record<string, any>>,
    res: Response
  ) => {
    const { email } = req.body

    try {
      const user = undefined // TODO: find user by email

      if (!user) {
        return res.status(200).send({ code: 'otp_sent' })
      }

      const { otp, otpHash, otpExpiry } = generateOTP()

      // TODO: save otpHash and otpExpiry to user

      await sendSESEmail({
        to: email,
        templateName: process.env.SES_TEMPLATE_FI_OTP || '',
        templateData: {
          otp: otp,
        },
      })

      res.status(200).send({ code: 'otp_sent' })
    } catch (error) {
      console.error(error)
      res.status(500).send({ error_code: 'otp_request_failed' })
    }
  }
)

router.post(
  '/verify-otp',
  async (req: Request<{}, {}, OTPVerifyBody>, res: Response) => {
    const { email, otp } = req.body
    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown'

    try {
      const user = undefined // TODO: find user by email
      const otpVerified = false // TODO: verify otp against the hash stored in the user
      if (!user || !otpVerified) {
        return res.status(400).send({ error: 'Invalid OTP or OTP expired' })
      }

      // TODO: reset otpHash and otpExpiry in user

      const sessionId = crypto.randomUUID()

      const accessToken = generateAccessToken(user, sessionId)
      const refreshToken = await generateRefreshToken(user, sessionId)

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      })

      res.send({ accessToken })
    } catch (error) {
      console.error(error)
      res.status(500).send({ error_code: 'otp_verify_failed' })
    }
  }
)

router.post(
  '/refresh-token',
  async (req: Request<{}, {}, {}>, res: Response) => {
    try {
      const refreshToken = req.cookies.refreshToken
      if (!refreshToken) {
        return res
          .status(401)
          .send({ code: 'refresh_failed', error: 'Refresh token not found' })
      }

      if (!process.env.JWT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET is not defined')
      }
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET
      ) as JWTPayload
      const user = undefined // TODO: find user by id
      if (!user) {
        return res
          .status(401)
          .send({ code: 'refresh_failed', error: 'User not found' })
      }

      const storedToken: StoredToken | undefined = undefined // TODO: find token by userId and sessionId

      if (!storedToken) {
        return res.status(401).send({
          code: 'refresh_failed',
          error: 'Invalid session or token not found',
        })
      }

      const isValid = await bcrypt.compare(refreshToken, storedToken.token)

      if (!isValid) {
        return res
          .status(401)
          .send({ code: 'refresh_failed', error: 'Invalid refresh token' })
      }

      if (storedToken.expiresAt < new Date()) {
        // TODO: delete the old token from db
        return res
          .status(401)
          .send({ code: 'refresh_failed', error: 'Refresh token has expired' })
      }

      const sessionId = crypto.randomUUID()

      const newAccessToken = generateAccessToken(user, sessionId)

      // Then create a new one
      const newRefreshToken = await generateRefreshToken(user, sessionId)

      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      })

      // TODO: delete the old token from db

      res.send({ accessToken: newAccessToken })
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'JsonWebTokenError') {
        return res.status(401).send({ error: 'Invalid token' })
      }
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        return res.status(401).send({ error: 'Token has expired' })
      }
      console.error(error)
      res.status(500).send({ error: 'Internal server error' })
    }
  }
)

router.post('/logout', async (req: Request<{}, {}, {}>, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) {
      return res.status(400).send({ error: 'No refresh token provided' })
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not defined')
    }
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    ) as JWTPayload

    // TODO: delete the token from db

    res.clearCookie('refreshToken')
    res.send({ message: 'Logged out successfully' })
  } catch (error) {
    console.error(error)
    res.status(500).send({ error: 'Internal server error' })
  }
})

export default router
