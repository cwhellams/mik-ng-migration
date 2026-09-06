import type { Context, ErrorHandler, NotFoundHandler } from 'hono'
import { getReasonPhrase } from 'http-status-codes'
import { ZodError } from 'zod'

import type { Problem } from '@mik/contracts/problem'

import { getEnv } from './context'

/**
 * RFC 9457 problem responses, ported from apps/backend/src/routes/response.ts.
 *
 * The wire format is identical field for field, because both frontends already
 * read it — `Problem` in @mik/contracts is the shared contract, and the member
 * app's error rendering keys off `detail`.
 *
 * One handler is gone rather than ported: multer's. There is no multer on
 * workerd (uploads arrive through `c.req.formData()`), so its LIMIT_FILE_SIZE
 * branch has nothing to catch. The size limit it enforced has to be
 * reimplemented at the upload sites when those domains port.
 */
export class ProblemDetail extends Error {
  problem: Problem

  constructor(problem: Problem) {
    super(problem.detail)
    this.problem = problem
  }
}

export const problem = (problem: Problem): never => {
  throw new ProblemDetail(problem)
}

/**
 * `getReasonPhrase` throws on a status it does not know.
 *
 * In Express that surfaced as a 500 from the error handler itself; on workerd
 * an exception inside the error handler yields a bare `Internal Server Error`
 * with no body at all, so the caller learns nothing. Falling back to 'Error'
 * keeps a malformed status from destroying the response.
 */
const titleFor = (status: number): string => {
  try {
    return getReasonPhrase(status)
  } catch {
    return 'Error'
  }
}

const sendProblem = (c: Context, problem: Problem) =>
  c.json(
    {
      status: problem.status,
      type: problem.type,
      title: problem.title ?? titleFor(problem.status),
      detail: problem.detail,
      instance: problem.instance ?? c.req.path,
      timestamp: new Date().toISOString(),
      ...problem.extensions,
    },
    problem.status as never,
    { 'content-type': 'application/problem+json' },
  )

export const problemErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ProblemDetail) {
    return sendProblem(c, err.problem)
  }

  if (err instanceof ZodError) {
    return sendProblem(c, {
      status: 400,
      // The full issue list is always in extensions.errors; detail surfaces the
      // first one so a client that only reads `detail` (like RemoteContent)
      // still shows something more useful than a bare "Bad Request".
      detail: err.issues[0]?.message,
      extensions: {
        errors: err.issues,
      },
    })
  }

  console.error(err)

  return sendProblem(c, {
    status: 500,
    detail:
      getEnv().NODE_ENV === 'test'
        ? err.message
        : 'An unexpected error occurred. Please try again later.',
  })
}

export const notFoundProblemHandler: NotFoundHandler = (c) =>
  c.json(
    {
      status: 404,
      title: 'Page not found',
      instance: c.req.path,
      timestamp: new Date().toISOString(),
    },
    404,
    { 'content-type': 'application/problem+json' },
  )
