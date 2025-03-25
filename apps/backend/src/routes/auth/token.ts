import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken'

export const decodeToken = <T>(secret: string, token?: string, options?: VerifyOptions): T => {
  if (typeof token !== 'string') throw new Error('No token provided')

  return jwt.verify(token, secret, options) as T
}

export const generateToken = (
  secret: string,
  payload?: object,
  options: SignOptions = { expiresIn: '60min' },
): string => {
  return jwt.sign(payload ?? {}, secret, options)
}
