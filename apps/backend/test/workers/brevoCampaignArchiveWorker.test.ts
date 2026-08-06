import 'dotenv/config'
import { jest } from '@jest/globals'

jest.unstable_mockModule('../../src/services/brevo/brevoClient.ts', () => ({
  getSentCampaigns: jest.fn(),
  getCampaignById: jest.fn(),
}))

jest.unstable_mockModule('../../src/db/brevo-campaign-archive-queries.ts', () => ({
  getLastBrevoCampaignArchiveState: jest.fn(),
  createBrevoCampaignArchiveState: jest.fn(),
  updateBrevoCampaignArchiveState: jest.fn(),
  isCampaignAlreadyArchived: jest.fn(),
}))

jest.unstable_mockModule('../../src/db/document-queries.ts', () => ({
  addDocument: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/htmlToPdf.ts', () => ({
  renderHtmlToPdf: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/storage.ts', () => ({
  storageService: { uploadFile: jest.fn() },
}))

const { getSentCampaigns, getCampaignById } =
  await import('../../src/services/brevo/brevoClient.ts')
const {
  getLastBrevoCampaignArchiveState,
  createBrevoCampaignArchiveState,
  updateBrevoCampaignArchiveState,
  isCampaignAlreadyArchived,
} = await import('../../src/db/brevo-campaign-archive-queries.ts')
const { addDocument } = await import('../../src/db/document-queries.ts')
const { renderHtmlToPdf } = await import('../../src/services/htmlToPdf.ts')
const { storageService } = await import('../../src/services/storage.ts')
const { startBrevoCampaignArchiveWorker } =
  await import('../../src/workers/brevoCampaignArchiveWorker.ts')

const mockGetSentCampaigns = getSentCampaigns as jest.MockedFunction<typeof getSentCampaigns>
const mockGetCampaignById = getCampaignById as jest.MockedFunction<typeof getCampaignById>
const mockGetLastState = getLastBrevoCampaignArchiveState as jest.MockedFunction<
  typeof getLastBrevoCampaignArchiveState
>
const mockCreateState = createBrevoCampaignArchiveState as jest.MockedFunction<
  typeof createBrevoCampaignArchiveState
>
const mockUpdateState = updateBrevoCampaignArchiveState as jest.MockedFunction<
  typeof updateBrevoCampaignArchiveState
>
const mockIsAlreadyArchived = isCampaignAlreadyArchived as jest.MockedFunction<
  typeof isCampaignAlreadyArchived
>
const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>
const mockRenderHtmlToPdf = renderHtmlToPdf as jest.MockedFunction<typeof renderHtmlToPdf>
const mockUploadFile = storageService.uploadFile as jest.MockedFunction<
  typeof storageService.uploadFile
>

function makeWorkerDeps() {
  const capturedCallbacks: (() => Promise<void>)[] = []
  const cronSchedule = jest.fn((_pattern: string, callback: () => Promise<void>) => {
    capturedCallbacks.push(callback)
    return { stop: jest.fn() }
  })
  return { cronSchedule, capturedCallbacks }
}

const campaign1 = {
  id: 1,
  name: 'January Newsletter',
  subject: 'January news',
  status: 'sent',
  sentDate: '2026-01-15T08:00:00.000Z',
}

const campaign2 = {
  id: 2,
  name: 'February Newsletter',
  subject: 'February news',
  status: 'sent',
  sentDate: '2026-02-15T08:00:00.000Z',
}

describe('brevoCampaignArchiveWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.BREVO_CAMPAIGN_ARCHIVE_ENABLED = 'true'
    mockRenderHtmlToPdf.mockResolvedValue(Buffer.from('pdf-bytes'))
    mockUploadFile.mockResolvedValue({
      key: 'newsletter/file.pdf',
      url: 'https://example.com/file.pdf',
    })
    mockAddDocument.mockResolvedValue({} as any)
    mockIsAlreadyArchived.mockResolvedValue(false)
  })

  afterEach(() => {
    delete process.env.BREVO_CAMPAIGN_ARCHIVE_ENABLED
  })

  it('does not schedule anything when the worker is disabled', () => {
    process.env.BREVO_CAMPAIGN_ARCHIVE_ENABLED = 'false'
    const { cronSchedule } = makeWorkerDeps()
    startBrevoCampaignArchiveWorker({ cronSchedule: cronSchedule as any })
    expect(cronSchedule).not.toHaveBeenCalled()
  })

  it('bootstraps the cursor and archives nothing on first run', async () => {
    mockGetLastState.mockResolvedValue(null)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startBrevoCampaignArchiveWorker({ cronSchedule: cronSchedule as any })
    await capturedCallbacks[0]()

    expect(mockCreateState).toHaveBeenCalledWith(expect.any(Date), 0, 'SUCCESS')
    expect(mockGetSentCampaigns).not.toHaveBeenCalled()
    expect(mockAddDocument).not.toHaveBeenCalled()
  })

  it('archives newly sent campaigns and advances the cursor', async () => {
    mockGetLastState.mockResolvedValue({
      id: 7,
      last_synced_at: new Date('2026-01-01T00:00:00.000Z'),
      campaigns_archived: 3,
    } as any)
    mockGetSentCampaigns.mockResolvedValue([campaign1, campaign2] as any)
    mockGetCampaignById.mockImplementation(
      async (id: number) =>
        ({
          ...(id === 1 ? campaign1 : campaign2),
          htmlContent: `<html><body>Campaign ${id}</body></html>`,
        }) as any,
    )

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startBrevoCampaignArchiveWorker({ cronSchedule: cronSchedule as any })
    await capturedCallbacks[0]()

    expect(mockRenderHtmlToPdf).toHaveBeenCalledTimes(2)
    expect(mockUploadFile).toHaveBeenCalledTimes(2)
    expect(mockAddDocument).toHaveBeenCalledTimes(2)
    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'January news',
        category: 'newsletter',
        isPublic: true,
        tags: ['brevo-campaign-id:1'],
      }),
      expect.objectContaining({ memberId: 'k1mnimda' }),
    )
    expect(mockUpdateState).toHaveBeenCalledWith(7, expect.any(Date), 5, 'SUCCESS')
  })

  it('skips campaigns that are already archived', async () => {
    mockGetLastState.mockResolvedValue({
      id: 7,
      last_synced_at: new Date('2026-01-01T00:00:00.000Z'),
      campaigns_archived: 0,
    } as any)
    mockGetSentCampaigns.mockResolvedValue([campaign1, campaign2] as any)
    mockIsAlreadyArchived.mockImplementation(async (id: number) => id === 1)
    mockGetCampaignById.mockResolvedValue({ ...campaign2, htmlContent: '<p>Feb</p>' } as any)

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startBrevoCampaignArchiveWorker({ cronSchedule: cronSchedule as any })
    await capturedCallbacks[0]()

    expect(mockGetCampaignById).toHaveBeenCalledTimes(1)
    expect(mockGetCampaignById).toHaveBeenCalledWith(2)
    expect(mockAddDocument).toHaveBeenCalledTimes(1)
    expect(mockUpdateState).toHaveBeenCalledWith(7, expect.any(Date), 1, 'SUCCESS')
  })

  it('isolates a failure on one campaign so the others still get archived', async () => {
    mockGetLastState.mockResolvedValue({
      id: 7,
      last_synced_at: new Date('2026-01-01T00:00:00.000Z'),
      campaigns_archived: 0,
    } as any)
    mockGetSentCampaigns.mockResolvedValue([campaign1, campaign2] as any)
    mockGetCampaignById.mockImplementation(async (id: number) => {
      if (id === 1) throw new Error('Brevo API error')
      return { ...campaign2, htmlContent: '<p>Feb</p>' } as any
    })

    const { cronSchedule, capturedCallbacks } = makeWorkerDeps()
    startBrevoCampaignArchiveWorker({ cronSchedule: cronSchedule as any })
    await capturedCallbacks[0]()

    expect(mockAddDocument).toHaveBeenCalledTimes(1)
    expect(mockUpdateState).toHaveBeenCalledWith(7, expect.any(Date), 1, 'SUCCESS')
  })
})
