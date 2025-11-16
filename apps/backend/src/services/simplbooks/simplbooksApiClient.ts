import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import dotenv from 'dotenv'

import {
  clientFilterSchema,
  invoiceFilterSchema,
  ItemListSchema,
  mapMemberToClient,
  type ClientFilter,
  type InvoiceFilter,
  type InvoiceListItem,
  type InvoiceListResponse,
  type InvoicePost,
  type InvoiceResponse,
  type ItemListArticle,
  type ItemListPayload,
  type SimplBooksInsertResponse,
} from './models.ts'
import logger from '../../lib/logger.ts'
import { MemberSchema, type Member } from '../../routes/members/models.ts'
import dayjs from 'dayjs'
import http from 'http'
import https from 'https'

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

const httpAgent = new http.Agent({ keepAlive: false, timeout: 5000 })
const httpsAgent = new https.Agent({ keepAlive: false, timeout: 5000 })

export const simplbooksApiClient: AxiosInstance = axios.create({
  baseURL: url.toString(),
  httpAgent,
  httpsAgent,
  timeout: 5000,
  headers: {
    'X-Simplbooks-Token': simplbooksApiKey,
    'Content-Type': 'application/json',
    'X-Input-Format': 'json',
  },
})

simplbooksApiClient.interceptors.response.use(
  response => {
    logger.info(`[Response] ${response.status} ${response.config.url}`, response.data)
    return response
  },
  error => {
    logger.error(`[Error] ${error.response?.status} ${error.config.url}`, error)
    return Promise.reject(error)
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
}

export async function searchClient(filter: ClientFilter): Promise<unknown> {
  try {
    clientFilterSchema.parse(filter)
    const response = await simplbooksApiClient.get(`/clients/list`, { data: filter })
    return response.data
  } catch (error) {
    handleApiError(error)
    throw error
  }
}

export async function getInvoice(id: number): Promise<InvoiceResponse> {
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
}

export async function markInvoiceAsSent(id: number) {
  try {
    const response = await simplbooksApiClient.post(`/invoices/sent/${id}`)
    if (response.status !== 200) {
      throw new Error(`Failed to set invoice ${id} as sent : ${response.statusText}`)
    }
  } catch (error) {
    handleApiError(error)
    throw error
  }
}

export async function getInvoicePdf(id: string): Promise<string> {
  try {
    const response = await simplbooksApiClient.get(`/invoices/get_pdf/${id}`)
    if (response.status !== 200) {
      throw new Error(`Failed to get invoice: ${response.statusText}`)
    }
    // SimplBooks may return the PDF in different formats
    // If it's an object with a data property, extract it
    if (typeof response.data === 'object' && response.data !== null) {
      return response.data.data || response.data.pdf || response.data.content || ''
    }
    // Otherwise return the data directly (should be a base64 string)
    return response.data
  } catch (error) {
    handleApiError(error)
    throw error
  }
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
  try {
    invoiceFilterSchema.parse(filter)
    const response = await simplbooksApiClient.get(`/invoices/list`, { data: filter })
    return response.data
  } catch (error) {
    handleApiError(error)
    throw error
  }
}

export async function createSimplbooksInvoice(
  invoice: InvoicePost,
): Promise<SimplBooksInsertResponse> {
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
    response = await simplbooksApiClient.get(`/articles/list`, { data: filter(page) })
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

  return allListItems.map(item => item as ItemListArticle)
}
