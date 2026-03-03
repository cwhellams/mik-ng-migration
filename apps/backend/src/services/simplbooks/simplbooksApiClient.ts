import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import dotenv from 'dotenv'

import {
  clientFilterSchema,
  invoiceFilterSchema,
  ItemListSchema,
  mapMemberToClient,
  type ClientData,
  type ClientFilter,
  type InvoiceFilter,
  type InvoiceListItem,
  type InvoiceListResponse,
  type InvoicePost,
  type InvoiceResponse,
  type ItemListArticle,
  type ItemListPayload,
  type ReceiptPost,
  type SimplBooksInsertResponse,
} from './models.ts'
import logger from '../../lib/logger.ts'
import { MemberSchema, type Member } from '../../routes/members/models.ts'
import dayjs from 'dayjs'
import http from 'node:http'
import https from 'node:https'

dotenv.config()

const simplbooksBaseUri = process.env.SIMPLBOOKS_BASE_URI
const simplbooksCompanyId = process.env.SIMPLBOOKS_COMPANY_ID
const simplbooksApiKey = process.env.SIMPLBOOKS_API_KEY
const simplbooksApiVersion = process.env.SIMPLBOOKS_API || 'api'

const ZERO_DATE = '0000-00-00'

if (!simplbooksBaseUri || !simplbooksCompanyId || !simplbooksApiKey) {
  throw new Error('Missing required SimplBooks environment variables to form Base URI')
}

const url = new URL(simplbooksBaseUri)
url.pathname = `/${simplbooksCompanyId}/${simplbooksApiVersion}`

const httpAgent = new http.Agent({ keepAlive: false, timeout: 30000 })
const httpsAgent = new https.Agent({ keepAlive: false, timeout: 30000 })
//const isTest = process.env.NODE_ENV === 'test'

// SimplBooks rate limit: max 1 call per second
const RATE_LIMIT_DELAY = 1000 // ms

let rateLimitChain = Promise.resolve()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function enqueueRateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  let result!: T
  let error: unknown

  rateLimitChain = rateLimitChain
    .then(async () => {
      try {
        result = await fn()
      } catch (err) {
        error = err
      }
      await sleep(RATE_LIMIT_DELAY)
    })
    .catch(() => {
      // Catch errors from previous requests to prevent chain breakage
      // The actual error will be thrown below
    })

  await rateLimitChain

  if (error) {
    throw error
  }

  return result
}

export const simplbooksApiClient: AxiosInstance = axios.create({
  baseURL: url.toString(),
  httpAgent,
  httpsAgent,
  timeout: 30000,
  headers: {
    'X-Simplbooks-Token': simplbooksApiKey,
    'Content-Type': 'application/json',
    'X-Input-Format': 'json',
  },
})

simplbooksApiClient.interceptors.response.use(
  response => {
    logger.info(
      `[SimplBooks] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`,
    )
    return response
  },
  error => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const url = error.config?.url

      if (status === 429) {
        logger.error(`[SimplBooks] 429 Too Many Requests for ${url} – rate limit exceeded`)
      } else if (status && status >= 500) {
        logger.error(`[SimplBooks] ${status} Server error for ${url}`)
      } else {
        logger.error(`[SimplBooks] ${status ?? 'NO_STATUS'} Error for ${url}`)
      }
    } else {
      logger.error('[SimplBooks] Unknown error', error)
    }

    throw error
  },
)

function handleApiError(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    const { status, errors } = error.response.data

    if (Array.isArray(errors)) {
      logger.error(`API Error [${status}]: ${errors.join('; ')}`)
    } else {
      logger.error('Unexpected error response format:', error.response.data)
    }
  } else {
    logger.error('Unexpected error:', error)
  }
}

export async function createNewClient(client: Member): Promise<number> {
  return enqueueRateLimitedRequest(async () => {
    try {
      MemberSchema.parse(client)
      const simplbooksClient = mapMemberToClient(client)

      const response = await simplbooksApiClient.post(`/clients/create`, simplbooksClient)

      if (response.status !== 200) {
        throw new Error(
          `Failed to create client ${client.email} in Simplbooks: ${response.statusText}`,
        )
      }

      return response.data.inserted_id
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function updateClient(billingId: number, client: ClientData): Promise<void> {
  return enqueueRateLimitedRequest(async () => {
    try {
      const simplbooksClient = { Client: { id: billingId, ...client.Client } }
      const response = await simplbooksApiClient.post(`/clients/update`, simplbooksClient)
      if (response.status !== 200) {
        throw new Error(
          `Failed to update client ${client.Client.e_mail} in Simplbooks: ${response.statusText}`,
        )
      }
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function searchClient(filter: ClientFilter): Promise<unknown> {
  return enqueueRateLimitedRequest(async () => {
    try {
      clientFilterSchema.parse(filter)
      const response = await simplbooksApiClient.get(`/clients/list`, { data: filter })
      return response.data
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function getInvoice(id: number): Promise<InvoiceResponse> {
  return enqueueRateLimitedRequest(async () => {
    try {
      const response = await simplbooksApiClient.get(`/invoices/get/${id}`)
      if (response.status !== 200) {
        throw new Error(`Failed to get invoice ${id}: ${response.statusText}`)
      }
      return response.data
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function markInvoiceAsSentInSimplbooks(id: number) {
  return enqueueRateLimitedRequest(async () => {
    try {
      const response = await simplbooksApiClient.post(`/invoices/sent/${id}`)
      if (response.status !== 200) {
        throw new Error(`Failed to set invoice ${id} as sent : ${response.statusText}`)
      }
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function getInvoicePdf(id: string): Promise<string> {
  return enqueueRateLimitedRequest(async () => {
    try {
      const response = await simplbooksApiClient.get(`/invoices/get_pdf/${id}`, {
        timeout: 60000, // Increase timeout for potentially large PDFs
        headers: {
          Accept: '*/*', // Override default Accept: application/json
        },
      })
      if (response.status !== 200) {
        throw new Error(`Failed to get invoice: ${response.statusText}`)
      }

      // SimplBooks returns JSON with base64 PDF in the "data" field
      if (response.data && response.data.data) {
        logger.info(`Successfully fetched PDF for invoice ${id}`)
        return response.data.data
      }

      throw new Error(`Invalid PDF response format for invoice ${id}`)
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function getOverdueInvoices(
  fromDate: string,
  toDate: string,
  page: number,
  perPage: number,
): Promise<InvoiceListItem[]> {
  const filter: InvoiceFilter = {
    created_from: fromDate,
    created_until: toDate,
    per_page: perPage,
    page: page,
  }

  const invoices = await searchInvoices(filter)

  return invoices.data
    .filter(
      i =>
        i.invoices.paid == ZERO_DATE &&
        dayjs(i.invoices.due).startOf('day').isBefore(dayjs().startOf('day')),
    )
    .map(i => i.invoices)
}

export async function searchInvoices(filter: InvoiceFilter): Promise<InvoiceListResponse> {
  return enqueueRateLimitedRequest(async () => {
    try {
      invoiceFilterSchema.parse(filter)
      const response = await simplbooksApiClient.get(`/invoices/list`, { data: filter })
      return response.data
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function createSimplbooksInvoice(
  invoice: InvoicePost,
): Promise<SimplBooksInsertResponse> {
  return enqueueRateLimitedRequest(async () => {
    try {
      const response = await simplbooksApiClient.post(`/invoices/create`, invoice)
      if (response.status !== 200) {
        throw new Error(`Failed to create invoice: ${response.statusText}`)
      }
      return response.data
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function createSimplbooksReceipt(
  receipt: ReceiptPost,
): Promise<SimplBooksInsertResponse> {
  return enqueueRateLimitedRequest(async () => {
    try {
      const response = await simplbooksApiClient.post(`/incomings/create`, receipt)
      if (response.status !== 200) {
        throw new Error(`Failed to create receipt: ${response.statusText}`)
      }
      return response.data
    } catch (error) {
      handleApiError(error)
      throw error
    }
  })
}

export async function getItemByCode(code: string): Promise<ItemListArticle | undefined> {
  const items = await getItems(code)

  // Find exact match by code
  return items.find(item => item.code === code)
}

export async function getItems(code?: string): Promise<ItemListArticle[]> {
  const filter = (page: number) => ({
    ...(code ? { code } : {}),
    page: page,
    per_page: 50,
  })
  let page: number = 1
  let getNextPage: boolean = true
  const allListItems: ItemListArticle[] = []
  let response: AxiosResponse<any>
  do {
    logger.info(`Fetching items from SimplBooks, page: ${page}`)
    response = await enqueueRateLimitedRequest(() =>
      simplbooksApiClient.get(`/articles/list`, { data: filter(page) }),
    )
    if (response.status !== 200) {
      throw new Error(`Failed to get items from SimplBooks response: ${response.statusText}`)
    }
    const parsed = ItemListSchema.safeParse(response.data)

    if (!parsed.success) {
      logger.error(`Failed to parse SimplBooks response: ${JSON.stringify(parsed.error, null, 2)}`)
      throw new Error(`Failed to parse SimplBooks response: ${parsed.error.message}`)
    }

    const listItems: ItemListPayload = parsed.data
    allListItems.push(
      ...listItems.data.map(item => item.Article).filter(item => item.active === true),
    )
    page++
    getNextPage = listItems.data.length > 0 && listItems.data.length === 50
    logger.info(
      `Received ${listItems.data.length} items from SimplBooks, next page: ${page}. Continue loading: ${getNextPage}`,
    )
  } while (getNextPage)

  return allListItems.map(item => item)
}
