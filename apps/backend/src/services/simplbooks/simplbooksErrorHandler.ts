import axios from 'axios'
import logger from '../../lib/logger.ts'

type SimplbooksErrorResponse = {
  status?: number
  duration?: number
  errors?: string[]
  [key: string]: unknown
}

type SimplbooksErrorContext = {
  operation?: string
  endpoint?: string
  method?: string
  payload?: unknown
}

const PAYLOAD_PREVIEW_LIMIT = 1200

export class SimplbooksApiError extends Error {
  readonly statusCode?: number
  readonly endpoint: string
  readonly method: string
  readonly errors: string[]
  readonly payloadPreview?: string

  constructor(params: {
    message: string
    statusCode?: number
    endpoint: string
    method: string
    errors: string[]
    payloadPreview?: string
    cause?: unknown
  }) {
    super(params.message)
    this.name = 'SimplbooksApiError'
    this.statusCode = params.statusCode
    this.endpoint = params.endpoint
    this.method = params.method
    this.errors = params.errors
    this.payloadPreview = params.payloadPreview

    if (params.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = params.cause
    }
  }
}

function stringifyForLog(value: unknown): string {
  if (value === undefined) return ''

  if (typeof value === 'string') {
    return value.length > PAYLOAD_PREVIEW_LIMIT
      ? `${value.slice(0, PAYLOAD_PREVIEW_LIMIT)}...`
      : value
  }

  try {
    const serialized = JSON.stringify(value)
    if (!serialized) return ''
    return serialized.length > PAYLOAD_PREVIEW_LIMIT
      ? `${serialized.slice(0, PAYLOAD_PREVIEW_LIMIT)}...`
      : serialized
  } catch {
    return '[unserializable payload]'
  }
}

function parseConfigData(data: unknown): unknown {
  if (typeof data !== 'string') return data

  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function extractErrors(responseData: unknown, fallbackMessage: string): string[] {
  const apiPayload = responseData as SimplbooksErrorResponse

  if (Array.isArray(apiPayload?.errors) && apiPayload.errors.length > 0) {
    return apiPayload.errors
  }

  return [fallbackMessage]
}

function formatMessage(
  method: string,
  endpoint: string,
  statusCode: number | undefined,
  errors: string[],
) {
  const status = statusCode ?? 'NO_STATUS'
  const details = errors.join('; ')
  return `[SimplBooks] ${method} ${endpoint} failed (${status}): ${details}`
}

export function toSimplbooksApiError(
  error: unknown,
  context?: SimplbooksErrorContext,
): SimplbooksApiError {
  if (error instanceof SimplbooksApiError) {
    return error
  }

  if (axios.isAxiosError(error)) {
    const method = (context?.method ?? error.config?.method ?? 'GET').toUpperCase()
    const endpoint = context?.endpoint ?? error.config?.url ?? 'unknown-endpoint'
    const statusCode = error.response?.status
    const payloadSource = context?.payload ?? parseConfigData(error.config?.data)
    const payloadPreview = stringifyForLog(payloadSource)
    const fallbackMessage = error.message || 'SimplBooks request failed'
    const errors = extractErrors(error.response?.data, fallbackMessage)

    return new SimplbooksApiError({
      message: formatMessage(method, endpoint, statusCode, errors),
      statusCode,
      endpoint,
      method,
      errors,
      payloadPreview: payloadPreview || undefined,
      cause: error,
    })
  }

  const method = (context?.method ?? 'N/A').toUpperCase()
  const endpoint = context?.endpoint ?? 'unknown-endpoint'
  const payloadPreview = stringifyForLog(context?.payload)
  const fallbackMessage = error instanceof Error ? error.message : 'Unknown SimplBooks error'
  const errors = [fallbackMessage]

  return new SimplbooksApiError({
    message: formatMessage(method, endpoint, undefined, errors),
    endpoint,
    method,
    errors,
    payloadPreview: payloadPreview || undefined,
    cause: error,
  })
}

export function logAndThrowSimplbooksError(
  error: unknown,
  context?: SimplbooksErrorContext,
): never {
  const parsed = toSimplbooksApiError(error, context)

  logger.error(parsed.message, {
    operation: context?.operation,
    endpoint: parsed.endpoint,
    method: parsed.method,
    statusCode: parsed.statusCode,
    errors: parsed.errors,
    payloadPreview: parsed.payloadPreview,
  })

  throw parsed
}
