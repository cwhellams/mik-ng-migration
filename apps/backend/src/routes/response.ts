import { z } from 'zod'

export const ErrorResponseSchema = z.object({
  errorCode: z.string().optional(),
  message: z.string().optional(),
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export function throwError(message: string): never {
  throw new Error(message)
}
