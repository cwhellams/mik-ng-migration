import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { z } from 'zod'

type ValidationSource = 'query' | 'body' | 'params'

// Parses req[source] against schema and stores the result on
// req.validated[source]. A failed parse throws a ZodError, which
// problemErrorHandler turns into the one RFC 9457 validation-error shape
// used everywhere else in the API.
export const validate = <T extends z.ZodTypeAny>(
  schema: T,
  source: ValidationSource = 'body',
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.validated = { ...req.validated, [source]: schema.parse(req[source]) }
    next()
  }
}
