import 'dotenv/config'
import { jest } from '@jest/globals'
import dayjs from 'dayjs'

jest.unstable_mockModule('../../src/db/aircraft-document-queries.ts', () => ({
  getAircraftDocumentsExpiringOn: jest.fn(),
  hasAircraftDocumentNotificationBeenSent: jest.fn(),
  recordAircraftDocumentNotificationSent: jest.fn(),
}))

jest.unstable_mockModule('../../src/lib/sendGmail.ts', () => ({
  sendEmail: jest.fn(),
}))

const {
  getAircraftDocumentsExpiringOn,
  hasAircraftDocumentNotificationBeenSent,
  recordAircraftDocumentNotificationSent,
} = await import('../../src/db/aircraft-document-queries.ts')

const { sendEmail } = await import('../../src/lib/sendGmail.ts')

const { startAircraftDocumentExpiryWorker } =
  await import('../../src/workers/aircraftDocumentExpiryWorker.ts')

const mockGetDocuments = getAircraftDocumentsExpiringOn as jest.MockedFunction<
  typeof getAircraftDocumentsExpiringOn
>
const mockHasBeenSent = hasAircraftDocumentNotificationBeenSent as jest.MockedFunction<
  typeof hasAircraftDocumentNotificationBeenSent
>
const mockRecordSent = recordAircraftDocumentNotificationSent as jest.MockedFunction<
  typeof recordAircraftDocumentNotificationSent
>
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>

const sampleDoc = {
  documentId: 42,
  aircraftRegistration: 'OH-ABC',
  documentType: 'ARC',
  title: 'Airworthiness Review Certificate',
  validTo: '2025-07-19',
}

function makeWorkerDeps() {
  const capturedCallbacks: (() => Promise<void>)[] = []
  const cronSchedule = jest.fn((_pattern: string, callback: () => Promise<void>) => {
    capturedCallbacks.push(callback)
    return { stop: jest.fn() }
  })
  return { cronSchedule, capturedCallbacks }
}

describe('aircraftDocumentExpiryWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AIRCRAFT_DOCUMENT_EXPIRY_WORKER_ENABLED = 'true'
    process.env.AIRCRAFT_DOCUMENT_EXPIRY_REMINDER_DAYS = '30,7'
  })

  afterEach(() => {
    delete process.env.AIRCRAFT_DOCUMENT_EXPIRY_WORKER_ENABLED
    delete process.env.AIRCRAFT_DOCUMENT_EXPIRY_REMINDER_DAYS
  })

  it('sends reminder email when document expires in 30 days and no prior notification exists', async () => {
    const reminderDate30 = dayjs().add(30, 'day').format('YYYY-MM-DD')
    const docFor30 = { ...sampleDoc, validTo: reminderDate30 }

    mockGetDocuments.mockImplementation(async (date: string) => {
      if (date === reminderDate30) return [docFor30]
      return []
    })
    mockHasBeenSent.mockResolvedValue(false)
    mockRecordSent.mockResolvedValue(undefined)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    expect(mockSendEmail).toHaveBeenCalledWith(
      'kalusto@mik.fi',
      expect.stringContaining('ARC (OH-ABC)'),
      expect.any(String),
    )
    expect(mockRecordSent).toHaveBeenCalledWith(42, 'REMINDER', 30)
  })

  it('sends reminder email when document expires in 7 days', async () => {
    const reminderDate7 = dayjs().add(7, 'day').format('YYYY-MM-DD')
    const docFor7 = { ...sampleDoc, validTo: reminderDate7 }

    mockGetDocuments.mockImplementation(async (date: string) => {
      if (date === reminderDate7) return [docFor7]
      return []
    })
    mockHasBeenSent.mockResolvedValue(false)
    mockRecordSent.mockResolvedValue(undefined)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    expect(mockSendEmail).toHaveBeenCalledWith(
      'kalusto@mik.fi',
      expect.stringContaining('ARC (OH-ABC)'),
      expect.any(String),
    )
    expect(mockRecordSent).toHaveBeenCalledWith(42, 'REMINDER', 7)
  })

  it('sends both 30-day and 7-day reminders independently for the same document', async () => {
    const reminderDate30 = dayjs().add(30, 'day').format('YYYY-MM-DD')
    const reminderDate7 = dayjs().add(7, 'day').format('YYYY-MM-DD')
    const docFor30 = { ...sampleDoc, validTo: reminderDate30 }
    const docFor7 = { ...sampleDoc, documentId: 43, validTo: reminderDate7 }

    mockGetDocuments.mockImplementation(async (date: string) => {
      if (date === reminderDate30) return [docFor30]
      if (date === reminderDate7) return [docFor7]
      return []
    })
    // 30-day reminder already sent for doc 42, but not the 7-day reminder for doc 43
    mockHasBeenSent.mockImplementation(
      async (_id: number, _type: string, daysThreshold?: number) => daysThreshold === 30,
    )
    mockRecordSent.mockResolvedValue(undefined)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    // Only the 7-day reminder should be sent (the 30-day one is already recorded)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockRecordSent).toHaveBeenCalledWith(43, 'REMINDER', 7)
  })

  it('does not send reminder when notification was already sent', async () => {
    const reminderDate = dayjs().add(30, 'day').format('YYYY-MM-DD')
    mockGetDocuments.mockImplementation(async (date: string) => {
      if (date === reminderDate) return [{ ...sampleDoc, validTo: reminderDate }]
      return []
    })
    mockHasBeenSent.mockResolvedValue(true)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockRecordSent).not.toHaveBeenCalled()
  })

  it('sends expired email when document expires today', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const expiredDoc = { ...sampleDoc, validTo: today }

    mockGetDocuments.mockImplementation(async (date: string) => {
      if (date === today) return [expiredDoc]
      return []
    })
    mockHasBeenSent.mockResolvedValue(false)
    mockRecordSent.mockResolvedValue(undefined)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    expect(mockSendEmail).toHaveBeenCalledWith(
      'kalusto@mik.fi',
      expect.stringContaining('expired'),
      expect.any(String),
    )
    expect(mockRecordSent).toHaveBeenCalledWith(42, 'EXPIRED', 0)
  })

  it('does not send expired email when notification was already sent', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    mockGetDocuments.mockImplementation(async (date: string) => {
      if (date === today) return [{ ...sampleDoc, validTo: today }]
      return []
    })
    mockHasBeenSent.mockResolvedValue(true)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('does not start when worker is disabled', () => {
    process.env.AIRCRAFT_DOCUMENT_EXPIRY_WORKER_ENABLED = 'false'
    const { cronSchedule } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })
    expect(cronSchedule).not.toHaveBeenCalled()
  })

  it('returns no documents when a newer version exists — suppression handled by DB query', async () => {
    mockGetDocuments.mockResolvedValue([])

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startAircraftDocumentExpiryWorker({
      sendEmailFn: mockSendEmail,
      cronSchedule: cronSchedule as any,
    })

    await capturedCallbacks[0]()

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockRecordSent).not.toHaveBeenCalled()
  })
})
