import type { AxiosResponse } from 'axios'
import { AxiosError } from 'axios'

let contactIdCounter = 1000

function createNotFoundError(): AxiosError {
  return new AxiosError('Contact does not exist', 'ERR_NOT_FOUND', {} as any, {} as any, {
    status: 404,
    statusText: 'Not Found',
    data: {
      code: 'document_not_found',
      message: 'Contact does not exist',
    },
    headers: {},
    config: {} as any,
  })
}

export function mockBrevoPost(url: string, data?: any): Promise<AxiosResponse> {
  if (url.includes('/contacts')) {
    // Check for duplicate email
    if (data?.email === 'duplicate@example.com') {
      const error = new AxiosError(
        'Contact already exists',
        'ERR_BAD_REQUEST',
        {} as any,
        {} as any,
        {
          status: 400,
          statusText: 'Bad Request',
          data: {
            code: 'duplicate_parameter',
            message: 'Contact already exists',
          },
          headers: {},
          config: {} as any,
        },
      )
      return Promise.reject(error)
    }

    return Promise.resolve({
      data: {
        id: ++contactIdCounter,
      },
      status: 201,
      statusText: 'Created',
      headers: {},
      config: {} as any,
    })
  }

  return Promise.reject(new Error(`Unhandled URL: ${url}`))
}

export function mockBrevoPut(url: string, data?: any): Promise<AxiosResponse> {
  if (url.includes('/contacts/')) {
    // Extract the identifier from URL (handle query params)
    const baseUrl = url.split('?')[0]
    const decodedUrl = decodeURIComponent(baseUrl)

    // Simulate not found error
    if (decodedUrl.includes('notfound@example.com') || decodedUrl.includes('999999')) {
      return Promise.reject(createNotFoundError())
    }

    return Promise.resolve({
      data: {},
      status: 204,
      statusText: 'No Content',
      headers: {},
      config: {} as any,
    })
  }

  return Promise.reject(new Error(`Unhandled URL: ${url}`))
}

export function mockBrevoDelete(url: string): Promise<AxiosResponse> {
  if (url.includes('/contacts/')) {
    // Extract the identifier from URL (handle query params)
    const baseUrl = url.split('?')[0]
    const decodedUrl = decodeURIComponent(baseUrl)

    // Simulate not found error
    if (decodedUrl.includes('notfound@example.com')) {
      return Promise.reject(createNotFoundError())
    }

    return Promise.resolve({
      data: {},
      status: 204,
      statusText: 'No Content',
      headers: {},
      config: {} as any,
    })
  }

  return Promise.reject(new Error(`Unhandled URL: ${url}`))
}

export function mockBrevoGet(url: string): Promise<AxiosResponse> {
  if (url.includes('/contacts/')) {
    // Extract the identifier from URL (handle query params)
    const baseUrl = url.split('?')[0]
    const decodedUrl = decodeURIComponent(baseUrl)

    // Simulate not found error
    if (decodedUrl.includes('notfound@example.com') || decodedUrl.includes('999999')) {
      return Promise.reject(createNotFoundError())
    }

    // Handle duplicate contact lookup
    if (decodedUrl.includes('duplicate@example.com')) {
      return Promise.resolve({
        data: {
          id: 12345,
          email: 'duplicate@example.com',
          attributes: {
            FIRSTNAME: 'Duplicate',
            LASTNAME: 'User',
            MEMBER_TYPE: 'FLYING',
            LANG_ISO639: 'en',
            IS_MEMBERSHIP_EXPIRED: false,
            EMAIL_VERIFIED: true,
          },
          listIds: [5],
          emailBlacklisted: false,
          smsBlacklisted: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          modifiedAt: '2024-01-01T00:00:00.000Z',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })
    }

    return Promise.resolve({
      data: {
        id: 12345,
        email: 'test@example.com',
        attributes: {
          FIRSTNAME: 'Test',
          LASTNAME: 'User',
          MEMBER_TYPE: 'FLYING',
          LANG_ISO639: 'en',
          IS_MEMBERSHIP_EXPIRED: false,
          EMAIL_VERIFIED: true,
        },
        listIds: [5, 4],
        emailBlacklisted: false,
        smsBlacklisted: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-01T00:00:00.000Z',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    })
  }

  return Promise.reject(new Error(`Unhandled URL: ${url}`))
}
