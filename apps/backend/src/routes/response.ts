import type { Request, Response, NextFunction } from 'express'
import { getReasonPhrase } from 'http-status-codes'
import { z, ZodError } from 'zod'

// https://www.rfc-editor.org/rfc/rfc9457.html
export const ProblemSchema = z.object({
  // The HTTP status code
  status: z.number(),

  // A URI reference that identifies the problem type
  type: z.string().optional(),

  // A short, human-readable summary of the problem type.
  title: z.string().optional(),

  // A human-readable explanation
  // If present, ought to focus on helping the client correct the problem,
  // rather than giving debugging information.
  detail: z.string().optional(),

  // A URI reference that identifies the specific occurrence of the problem
  instance: z.string().optional(),

  // A timestamp indicating when the problem was generated
  timestamp: z.string().datetime().optional(),

  extensions: z.record(z.string(), z.unknown()).optional(),
})

export type Problem = z.infer<typeof ProblemSchema>

class ProblemDetail extends Error {
  problem: Problem

  constructor(problem: Problem) {
    super(problem.detail)
    this.problem = problem
  }
}

export const problem = (problem: Problem): never => {
  throw new ProblemDetail(problem)
}

export const problemErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(err)
  }

  const sendProblem = (problem: Problem) =>
    res
      .status(problem.status)
      .contentType('application/problem+json')
      .json({
        status: problem.status,
        type: problem.type,
        title: problem.title ?? getReasonPhrase(problem.status),
        detail: problem.detail,
        instance: problem.instance ?? req.path,
        timestamp: new Date().toISOString(),
        ...problem.extensions,
      })

  if (err instanceof ProblemDetail) {
    return sendProblem(err.problem)
  }

  if (err instanceof ZodError) {
    return sendProblem({
      status: 400,
      extensions: {
        errors: err.errors,
      },
    })
  }

  console.error(err)

  return sendProblem({
    status: 500,
    detail: err.message,
  })
}

export const notFoundProblemHandler = (req: Request, res: Response) => {
  res.status(404).contentType('application/problem+json').json({
    status: 404,
    title: 'Page not found',
    instance: req.path,
    timestamp: new Date().toISOString(),
  })
}
