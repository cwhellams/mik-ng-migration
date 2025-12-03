import { customAlphabet } from 'nanoid'

// Custom alphabet with only uppercase letters and numbers (no lowercase, no special chars)
// Total length is 9 chars: MIK_ (4 chars) + 5 random chars
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 5)

export function generateShortId(): string {
  return `MIK_${nanoid()}`
}
