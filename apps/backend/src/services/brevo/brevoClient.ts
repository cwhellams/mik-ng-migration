import axios, { type AxiosInstance, AxiosError } from 'axios'
import logger from '../../lib/logger.ts'
import type {
  BrevoContact,
  BrevoCreateContactRequest,
  BrevoUpdateContactRequest,
  BrevoErrorResponse,
  BrevoCampaign,
  BrevoCampaignListResponse,
} from './models.ts'

// Initialize axios client
const apiKey = process.env.BREVO_API_KEY || ''
const apiUrl = process.env.BREVO_API_URL || 'https://api.brevo.com/v3'

export const isBrevoSyncEnabled = process.env.BREVO_SYNC_WORKER_ENABLED === 'true'
export const runBrevoSyncOnStartup = process.env.BREVO_SYNC_WORKER_RUN_ON_STARTUP === 'true'
export const isBrevoConfigured = Boolean(apiKey)

if (!apiKey && isBrevoSyncEnabled) {
  throw new Error('BREVO_API_KEY is not configured but Brevo sync worker is enabled')
}

if (!apiKey && process.env.BREVO_CAMPAIGN_ARCHIVE_ENABLED === 'true') {
  throw new Error('BREVO_API_KEY is not configured but Brevo campaign archive worker is enabled')
}

export const brevoApiClient: AxiosInstance = axios.create({
  baseURL: apiUrl,
  headers: {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10000,
})

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 10000

// Add response interceptor for retry logic and logging
brevoApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    // Initialize retry count
    if (!config.__retryCount) {
      config.__retryCount = 0
    }

    // Check if we should retry (429 rate limit or network errors)
    const shouldRetry =
      (error.response?.status === 429 || !error.response) && config.__retryCount < MAX_RETRIES

    if (shouldRetry) {
      config.__retryCount++

      // Calculate exponential backoff delay
      const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, config.__retryCount - 1)
      const delay = Math.min(baseDelay, MAX_RETRY_DELAY_MS)

      // Add jitter (random ±25% of delay)
      const jitter = delay * 0.25 * (Math.random() * 2 - 1)
      const finalDelay = Math.round(delay + jitter)

      logger.warn(
        `Brevo API rate limit hit (429) or network error. Retrying in ${finalDelay}ms (attempt ${config.__retryCount}/${MAX_RETRIES})`,
      )

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, finalDelay))

      // Retry the request
      return brevoApiClient(config)
    }

    logError('Brevo API Error', error)
    throw error
  },
)

// Extend axios config to include retry count
declare module 'axios' {
  export interface AxiosRequestConfig {
    __retryCount?: number
  }
}

/**
 * Create a new contact in Brevo
 * @param contact - Contact data including email, ext_id, and attributes
 * @returns The created contact ID
 */
export async function createContact(contact: BrevoCreateContactRequest): Promise<number> {
  try {
    logger.info(`Creating Brevo contact for email: ${contact.email}`)

    const response = await brevoApiClient.post<{ id: number }>('/contacts', {
      email: contact.email,
      ext_id: contact.ext_id,
      attributes: contact.attributes,
      listIds: contact.listIds,
      updateEnabled: contact.updateEnabled ?? true,
    })

    logger.info(`Successfully created Brevo contact with ID: ${response.data.id}`)
    return response.data.id
  } catch (error) {
    if (isDuplicateError(error)) {
      logger.warn(`Contact with email ${contact.email} already exists in Brevo`)
      // If contact exists, try to get it and return the ID
      const existingContact = await getContactByEmail(contact.email)
      if (existingContact) {
        return existingContact.id
      }
    }
    throw handleError(error, 'Failed to create Brevo contact')
  }
}

/**
 * Update an existing contact in Brevo by Brevo contact ID (numeric ID)
 * @param brevoId - Numeric Brevo contact ID of the contact to update
 * @param updates - Contact updates including attributes and list management
 */
export async function updateContact(
  brevoId: number,
  updates: BrevoUpdateContactRequest,
): Promise<void> {
  try {
    logger.info(`Updating Brevo contact: ${brevoId}`)

    await brevoApiClient.put(`/contacts/${brevoId}`, {
      attributes: updates.attributes,
      listIds: updates.listIds,
      unlinkListIds: updates.unlinkListIds,
    })

    logger.info(`Successfully updated Brevo contact: ${brevoId}`)
  } catch (error) {
    throw handleError(error, 'Failed to update Brevo contact')
  }
}

/**
 * Delete a contact from Brevo
 * @param brevoId - numerid Id od the Brevo contact to delete
 */
export async function deleteContact(brevoId: number): Promise<void> {
  try {
    logger.info(`Deleting Brevo contact: ${brevoId}`)

    await brevoApiClient.delete(`/contacts/${brevoId}`)

    logger.info(`Successfully deleted Brevo contact: ${brevoId}`)
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn(`Contact ${brevoId} not found in Brevo, treating as already deleted`)
      return
    }
    throw handleError(error, 'Failed to delete Brevo contact')
  }
}

/**
 * Get contact by email address
 * @param email - Email address of the contact
 * @returns The contact data or null if not found
 */
export async function getContactByEmail(email: string): Promise<BrevoContact | null> {
  try {
    const response = await brevoApiClient.get<BrevoContact>(
      `/contacts/${encodeURIComponent(email)}?identifierType=email_id`,
    )
    return response.data
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }
    throw handleError(error, 'Failed to get Brevo contact by email')
  }
}

/**
 * Get contact by ext_id (member_id)
 * @param extId - External ID (member_id from database)
 * @returns The contact data or null if not found
 */
export async function getContactByExtId(extId: string): Promise<BrevoContact | null> {
  try {
    const response = await brevoApiClient.get<BrevoContact>(
      `/contacts/${encodeURIComponent(extId)}?identifierType=ext_id`,
    )
    return response.data
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }
    throw handleError(error, 'Failed to get Brevo contact by ext_id')
  }
}

/**
 * Add an existing contact to a Brevo mailing list
 * @param brevoContactId - Numeric Brevo contact ID
 * @param listId - Numeric Brevo list ID
 */
export async function addContactToMailingList(
  brevoContactId: number,
  listId: number,
): Promise<void> {
  try {
    logger.info(`Adding Brevo contact ${brevoContactId} to list ${listId}`)
    await brevoApiClient.post(`/contacts/lists/${listId}/contacts/add`, {
      ids: [brevoContactId],
    })
    logger.info(`Successfully added Brevo contact ${brevoContactId} to list ${listId}`)
  } catch (error) {
    throw handleError(error, `Failed to add contact ${brevoContactId} to list ${listId}`)
  }
}

/**
 * Remove an existing contact from a Brevo mailing list
 * @param brevoContactId - Numeric Brevo contact ID
 * @param listId - Numeric Brevo list ID
 */
export async function removeContactFromMailingList(
  brevoContactId: number,
  listId: number,
): Promise<void> {
  try {
    logger.info(`Removing Brevo contact ${brevoContactId} from list ${listId}`)
    await brevoApiClient.post(`/contacts/lists/${listId}/contacts/remove`, {
      ids: [brevoContactId],
    })
    logger.info(`Successfully removed Brevo contact ${brevoContactId} from list ${listId}`)
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn(
        `Contact ${brevoContactId} not found in list ${listId}, treating as already removed`,
      )
      return
    }
    throw handleError(error, `Failed to remove contact ${brevoContactId} from list ${listId}`)
  }
}

const SENT_CAMPAIGNS_PAGE_SIZE = 50

/**
 * Get sent email campaigns since a given date, oldest first. Paginates
 * through the full result set using the response's `count` field so
 * campaigns beyond the first page aren't silently skipped.
 * @param sinceDate - Only campaigns sent on or after this date are returned
 * @returns Sent campaigns (list view — no htmlContent; fetch via getCampaignById for that)
 */
export async function getSentCampaigns(sinceDate: Date): Promise<BrevoCampaign[]> {
  try {
    const campaigns: BrevoCampaign[] = []
    let offset = 0

    for (;;) {
      const response = await brevoApiClient.get<BrevoCampaignListResponse>('/emailCampaigns', {
        params: {
          status: 'sent',
          startDate: sinceDate.toISOString().slice(0, 10),
          sort: 'asc',
          limit: SENT_CAMPAIGNS_PAGE_SIZE,
          offset,
        },
      })

      campaigns.push(...response.data.campaigns)
      offset += SENT_CAMPAIGNS_PAGE_SIZE

      const gotFullPage = response.data.campaigns.length === SENT_CAMPAIGNS_PAGE_SIZE
      if (!gotFullPage || campaigns.length >= response.data.count) {
        break
      }
    }

    return campaigns
  } catch (error) {
    throw handleError(error, 'Failed to get sent Brevo campaigns')
  }
}

/**
 * Get full details of a single email campaign, including htmlContent
 * @param campaignId - Numeric Brevo campaign ID
 */
export async function getCampaignById(campaignId: number): Promise<BrevoCampaign> {
  try {
    const response = await brevoApiClient.get<BrevoCampaign>(`/emailCampaigns/${campaignId}`)
    return response.data
  } catch (error) {
    throw handleError(error, `Failed to get Brevo campaign ${campaignId}`)
  }
}

/**
 * Check if error is a duplicate contact error
 */
function isDuplicateError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    const brevoError = error.response?.data as BrevoErrorResponse
    return error.response?.status === 400 && brevoError?.code === 'duplicate_parameter'
  }
  return false
}

/**
 * Check if error is a not found error
 */
function isNotFoundError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === 404
  }
  return false
}

/**
 * Handle and format errors
 */
function handleError(error: unknown, message: string): Error {
  if (error instanceof AxiosError) {
    const brevoError = error.response?.data as BrevoErrorResponse
    return new Error(`${message}: ${brevoError?.message || error.message}`)
  }
  return error as Error
}

/**
 * Log errors with details
 */
function logError(message: string, error: unknown): void {
  if (error instanceof AxiosError) {
    logger.error(message, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    })
  } else {
    logger.error(message, error)
  }
}
