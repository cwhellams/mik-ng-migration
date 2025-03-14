import { Router, Request, Response } from 'express'
import { z } from 'zod'

import { generateAccessToken, generateJWTPayload, generateRefreshToken } from './tokens'
// import jwt from 'jsonwebtoken'
// import bcrypt from 'bcryptjs'
// import crypto from 'crypto'
// import generateOTP from '../../lib/generateOTP'
// import { sendEmail } from '../../lib/sendGmail'
import { getMember, getMemberRoles } from '../../db/queries'
import { ErrorResponse } from '../response'

export const router = Router()

const OTPRequestSchema = z.object({
  email: z.string(),
  otp: z.string().optional(),
})
export type OTPRequest = z.infer<typeof OTPRequestSchema>

const OTPResponseSchema = z.object({
  accessToken: z.string().optional(),
  code: z.string().optional(),
})
export type OTPResponse = z.infer<typeof OTPResponseSchema>

// interface StoredToken {
//   token: string
//   expiresAt: Date
// }

router.post(
  '/request-otp',
  async (
    req: Request<{}, {}, OTPRequest, Record<string, any>>,
    res: Response<{ code: string } | ErrorResponse>,
  ) => {
    const { email } = req.body

    const user = await getMember(email)
    if (!user) {
      return res.status(400).send({
        message: 'Invalid Request',
      })
    }

    // const { otp, otpHash, otpExpiry } = generateOTP()

    // TODO: save otpHash and otpExpiry to user

    // await sendEmail(email, 'OTP', otp)

    res.status(200).send({ code: 'otp_sent' })
  },
)

router.post(
  '/verify-otp',
  async (req: Request<{}, {}, OTPRequest>, res: Response<OTPResponse | ErrorResponse>) => {
    const { email, otp } = req.body
    // const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown'

    const user = await getMember(email)

    const otpVerified = otp && process.env.OTP_DISABLED == 'true' // TODO: verify otp against the hash stored in the user
    if (!user || !otpVerified) {
      return res.status(400).json({
        message: 'Invalid or expired code',
      })
    }

    // TODO: reset otpHash and otpExpiry in user
    const roles = await getMemberRoles(user.member_id)
    const payload = generateJWTPayload(user, roles)

    const accessToken = generateAccessToken(payload)
    const refreshToken = await generateRefreshToken(payload)

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })

    res.json({ accessToken })
  },
)

// router.post(
//   '/refresh-token',
//   async (req: Request<{}, {}, {}>, res: Response) => {
//     try {
//       const refreshToken = req.cookies.refreshToken
//       if (!refreshToken) {
//         return res
//           .status(401)
//           .send({ code: 'refresh_failed', error: 'Refresh token not found' })
//       }

//       if (!process.env.JWT_REFRESH_SECRET) {
//         throw new Error('JWT_REFRESH_SECRET is not defined')
//       }
//       const decoded = jwt.verify(
//         refreshToken,
//         process.env.JWT_REFRESH_SECRET
//       ) as JWTPayload
//       const user = undefined // TODO: find user by id
//       if (!user) {
//         return res
//           .status(401)
//           .send({ code: 'refresh_failed', error: 'User not found' })
//       }

//       const storedToken: StoredToken | undefined = undefined // TODO: find token by userId and sessionId

//       if (!storedToken) {
//         return res.status(401).send({
//           code: 'refresh_failed',
//           error: 'Invalid session or token not found',
//         })
//       }

//       const isValid = await bcrypt.compare(refreshToken, storedToken.token)

//       if (!isValid) {
//         return res
//           .status(401)
//           .send({ code: 'refresh_failed', error: 'Invalid refresh token' })
//       }

//       if (storedToken.expiresAt < new Date()) {
//         // TODO: delete the old token from db
//         return res
//           .status(401)
//           .send({ code: 'refresh_failed', error: 'Refresh token has expired' })
//       }

//       const sessionId = crypto.randomUUID()

//       const newAccessToken = generateAccessToken(user, sessionId)

//       // Then create a new one
//       const newRefreshToken = await generateRefreshToken(user, sessionId)

//       res.cookie('refreshToken', newRefreshToken, {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === 'production',
//         sameSite: 'strict',
//       })

//       // TODO: delete the old token from db

//       res.send({ accessToken: newAccessToken })
//     } catch (error: unknown) {
//       if (error instanceof Error && error.name === 'JsonWebTokenError') {
//         return res.status(401).send({ error: 'Invalid token' })
//       }
//       if (error instanceof Error && error.name === 'TokenExpiredError') {
//         return res.status(401).send({ error: 'Token has expired' })
//       }
//       console.error(error)
//       res.status(500).send({ error: 'Internal server error' })
//     }
//   }
// )

// router.post('/logout', async (req: Request<{}, {}, {}>, res: Response) => {
//   try {
//     const refreshToken = req.cookies.refreshToken
//     if (!refreshToken) {
//       return res.status(400).send({ error: 'No refresh token provided' })
//     }

//     if (!process.env.JWT_REFRESH_SECRET) {
//       throw new Error('JWT_REFRESH_SECRET is not defined')
//     }
//     const decoded = jwt.verify(
//       refreshToken,
//       process.env.JWT_REFRESH_SECRET
//     ) as JWTPayload

//     // TODO: delete the token from db

//     res.clearCookie('refreshToken')
//     res.send({ message: 'Logged out successfully' })
//   } catch (error) {
//     console.error(error)
//     res.status(500).send({ error: 'Internal server error' })
//   }
// })

// export default router
