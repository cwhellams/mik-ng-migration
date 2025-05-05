import axios, { type AxiosInstance } from 'axios'
import dotenv from 'dotenv'

import {
  clientFilterSchema,
  invoiceFilterSchema,
  InvoiceRootSchema,
  mapMemberToClient,
  type ClientFilter,
  type Invoice,
  type InvoiceFilter,
} from './models.ts'
import logger from '../../lib/logger.ts'
import { MemberSchema, type MemberProfile } from '../../routes/members/models.ts'

dotenv.config()

const simplbooksBaseUri = process.env.SIMPLBOOKS_BASE_URI
const simplbooksApiKey = process.env.SIMPLBOOKS_API_KEY

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

export async function createNewClient(client: MemberProfile): Promise<number> {
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

export async function getInvoice(id: number): Promise<unknown> {
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

export async function searchInvoices(filter: InvoiceFilter): Promise<unknown> {
  try {
    invoiceFilterSchema.parse(filter)
    const response = await simplbooksApiClient.get(`/invoices/list`, { data: filter })
    return response.data
  } catch (error) {
    handleApiError(error)
    throw error
  }
}

export async function createInvoice(invoice: Invoice): Promise<unknown> {
  try {
    InvoiceRootSchema.parse(invoice)
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
