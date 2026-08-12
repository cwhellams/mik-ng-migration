import { jest } from '@jest/globals'
import { z, ZodError } from 'zod'
import { problem, problemErrorHandler } from '../../src/routes/response.ts'

describe('throwProblem', () => {
  test('should throw an error with the provided message', () => {
    const errorMessage = 'Test error message'
    expect(() => problem({ status: 500, detail: errorMessage })).toThrow(errorMessage)
  })

  test('should throw an instance of Error', () => {
    expect(() => problem({ status: 500, detail: 'Some error' })).toThrow(Error)
  })
})

describe('problemErrorHandler', () => {
  const makeRes = () => {
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ contentType: jest.fn().mockReturnValue({ json }) })
    const res = { headersSent: false, status } as unknown as import('express').Response
    return { res, json }
  }

  const req = { path: '/test' } as unknown as import('express').Request
  const next = jest.fn() as unknown as import('express').NextFunction

  test('should return the original error message in test environment', () => {
    const sensitiveError = new Error(
      'Connection refused: postgres://user:password@db.example.com:5432',
    )
    const { res, json } = makeRes()

    problemErrorHandler(sensitiveError, req, res, next)

    expect(json).toHaveBeenCalledTimes(1)
    const body = json.mock.calls[0][0] as Record<string, unknown>
    expect(body.detail).toBe(sensitiveError.message)
    expect(body.status).toBe(500)
  })

  test('should return a generic message and not leak error details in production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const sensitiveError = new Error(
        'Connection refused: postgres://user:password@db.example.com:5432',
      )
      const { res, json } = makeRes()

      problemErrorHandler(sensitiveError, req, res, next)

      expect(json).toHaveBeenCalledTimes(1)
      const body = json.mock.calls[0][0] as Record<string, unknown>
      expect(body.detail).toBe('An unexpected error occurred. Please try again later.')
      expect(body.detail).not.toContain('postgres://')
      expect(body.detail).not.toContain('password')
      expect(body.status).toBe(500)
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  test('surfaces the first Zod issue message as detail, alongside the full list', () => {
    const result = z.object({ startDate: z.string() }).safeParse({})
    const zodError = result.error as ZodError
    const { res, json } = makeRes()

    problemErrorHandler(zodError, req, res, next)

    expect(json).toHaveBeenCalledTimes(1)
    const body = json.mock.calls[0][0] as Record<string, unknown>
    expect(body.status).toBe(400)
    expect(body.detail).toBe(zodError.issues[0].message)
    expect(body.errors).toEqual(zodError.issues)
  })
})
