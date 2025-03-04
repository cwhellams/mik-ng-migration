import bcrypt from 'bcryptjs'

/**
 * Generates a 6-digit One-Time Password (OTP) with its hash and expiry time
 * @returns {Object} An object containing:
 *   - otp: The generated 6-digit OTP string
 *   - otpHash: Bcrypt hash of the OTP
 *   - otpExpiry: Timestamp (in milliseconds) when the OTP will expire (15 minutes from generation)
 */

interface OTPResult {
  otp: string
  otpHash: string
  otpExpiry: number
}

const generateOTP = (): OTPResult => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const otpHash = bcrypt.hashSync(otp, 10)
  const otpExpiry = Date.now() + 15 * 60 * 1000 // OTP valid for 15 minutes
  return { otp, otpHash, otpExpiry }
}

export default generateOTP
