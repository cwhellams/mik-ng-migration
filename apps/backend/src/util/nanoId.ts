import { customAlphabet } from 'nanoid'

// Custom alphabet with only uppercase letters and numbers (no lowercase, no special chars)
// Total length of random characters is 9.
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 9)

export function generateShortId(): string {
  return nanoid()
}
