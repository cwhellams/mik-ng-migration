import type { Request, Response, NextFunction } from 'express'
import { z, ZodError } from 'zod'

export const ErrorResponseSchema = z.object({
  errorCode: z.string().optional(),
  message: z.string().optional(),
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export function throwError(message: string): never {
  throw new Error(message)
}

export const defaultErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error(err)
  if (res.headersSent) {
    return next(err)
  }

  if (err instanceof ZodError) {
    return res.status(400).json(<ErrorResponse>{ message: err.message })
  }

  res.status(500).json(<ErrorResponse>{ message: 'Internal Server Error' })
}
