import axios, { type AxiosInstance } from 'axios'
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
  type SimplBooksInsertResponse,
} from './models.ts'
import logger from '../../lib/logger.ts'
import { MemberSchema, type Member } from '../../routes/members/models.ts'
import dayjs from 'dayjs'

dotenv.config()

const simplbooksBaseUri = process.env.SIMPLBOOKS_BASE_URI
const simplbooksApiKey = process.env.SIMPLBOOKS_API_KEY

const ZERO_DATE = '0000-00-00'

export const simplbooksApiClient: AxiosInstance = axios.create({
  baseURL: simplbooksBaseUri,
  timeout: 5000,
  headers: {
    'X-Simplbooks-Token': simplbooksApiKey,
    'Content-Type': 'application/json',
    'X-Input-Format': 'json',
  },
})

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
      throw new Error(`Failed to create client: ${response.statusText}`)
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
      throw new Error(`Failed to get invoice: ${response.statusText}`)
    }
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

export async function createInvoice(invoice: InvoicePost): Promise<SimplBooksInsertResponse> {
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

export async function getItemByCode(code: string): Promise<ItemListArticle> {
  try {
    const filter = {
      code,
    }

    const response = await simplbooksApiClient.get(`/articles/list`, { data: filter })
    if (response.status !== 200) {
      throw new Error(`Failed to get articles for code ${code} response: ${response.statusText}`)
    }
    const listItem = ItemListSchema.parse(response)
    return listItem.data[0].Article
  } catch (error) {
    handleApiError(error)
    throw error
  }
}
