import axios, { AxiosInstance } from 'axios'
import http from 'http'
import https from 'https'
import {
  SimplBooksClient,
  SimplBooksClientWrapper,
  SimplBooksListResponse,
} from './types.js'

export class SimplBooksApiClient {
  private client: AxiosInstance
  private lastRequestTime: number = 0
  private readonly minRequestInterval: number = 1000 // 1 second between requests

  constructor(baseUrl: string, apiKey: string, companyId: string) {
    const httpAgent = new http.Agent({ keepAlive: false, timeout: 5000 })
    const httpsAgent = new https.Agent({ keepAlive: false, timeout: 5000 })

    const apiBaseUrl = this.buildApiBaseUrl(baseUrl, companyId)

    this.client = axios.create({
      baseURL: apiBaseUrl,
      httpAgent,
      httpsAgent,
      timeout: 5000,
      headers: {
        'X-Simplbooks-Token': apiKey,
        'Content-Type': 'application/json',
        'X-Input-Format': 'json',
      },
    })
  }

  private buildApiBaseUrl(baseUrl: string, companyId: string): string {
    const url = new URL(baseUrl)
    const normalizedBasePath = url.pathname.replace(/^\/+|\/+$/g, '')
    const pathParts = [
      normalizedBasePath,
      encodeURIComponent(companyId),
      'api',
    ].filter(Boolean)
    url.pathname = `/${pathParts.join('/')}`
    return url.toString()
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    this.lastRequestTime = Date.now()
  }

  async getAllClients(): Promise<SimplBooksClient[]> {
    const allClients: SimplBooksClient[] = []
    let currentPage = 1
    const perPage = 100
    let hasMorePages = true

    while (hasMorePages) {
      try {
        // Rate limit to max 1 request per second
        await this.rateLimit()

        // SimplBooks API requires GET with request body (non-standard)
        const response = await this.client.request<
          SimplBooksListResponse<SimplBooksClientWrapper>
        >({
          method: 'GET',
          url: '/clients/list',
          data: {
            page: currentPage,
            per_page: perPage,
          },
        })

        // Validate response structure before processing
        if (!response.data || !Array.isArray(response.data.data)) {
          console.warn(
            `Invalid response format for page ${currentPage}: data is not an array`
          )
          hasMorePages = false
          continue
        }

        // Unwrap the Client objects from the wrapper
        const unwrappedClients = response.data.data.map(
          (wrapper) => wrapper.Client
        )

        const fetchedCount = unwrappedClients.length
        allClients.push(...unwrappedClients)

        console.log(
          `Fetched page ${currentPage}: ${fetchedCount} clients (total so far: ${allClients.length})`
        )

        // If we got fewer results than per_page, we've reached the last page
        hasMorePages = fetchedCount === perPage
        currentPage++
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(
            `Error fetching clients (page ${currentPage}):`,
            error.response?.data || error.message
          )
        } else {
          console.error(
            `Unexpected error fetching clients (page ${currentPage}):`,
            error
          )
        }
        throw error
      }
    }

    console.log(`Total clients fetched: ${allClients.length}`)
    return allClients
  }

  async searchClientsByName(name: string): Promise<SimplBooksClient[]> {
    try {
      // Rate limit to max 1 request per second
      await this.rateLimit()

      const response = await this.client.request<
        SimplBooksListResponse<SimplBooksClientWrapper>
      >({
        method: 'GET',
        url: '/clients/list',
        data: {
          name: name,
          per_page: 100,
        },
      })

      // Validate response structure before processing
      if (!response.data) {
        console.warn(`Empty response searching clients by name "${name}"`)
        return []
      }

      if (!Array.isArray(response.data.data)) {
        console.warn(
          `Invalid response format searching clients by name "${name}": data is not an array`,
          response.data
        )
        return []
      }

      // Unwrap the Client objects from the wrapper
      const clients = response.data.data.map((wrapper) => wrapper.Client)
      return clients
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Error searching clients by name "${name}":`,
          error.response?.status,
          error.response?.data || error.message
        )
      } else {
        console.error(
          `Unexpected error searching clients by name "${name}":`,
          error instanceof Error ? error.message : String(error)
        )
      }
      return []
    }
  }
}
