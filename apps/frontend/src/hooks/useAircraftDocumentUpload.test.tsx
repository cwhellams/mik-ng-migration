import type { AircraftDocument, AircraftDocumentType } from '@mik/contracts/aircraft-documents'
import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AIRCRAFT_REGISTRATION } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { DOCUMENT_CONSTANTS } from '../utils/documentHelpers'
import { useAircraftDocumentUpload, type AircraftDocumentFile } from './useAircraftDocumentUpload'

/** Builds a File carrying the extra metadata the uploader expects on it. */
const aDocumentFile = ({
  name = 'insurance.pdf',
  type = 'application/pdf',
  size = 1024,
  ...rest
}: Partial<AircraftDocumentFile> & { size?: number } = {}) => {
  const file = new File(['x'], name, { type }) as AircraftDocumentFile
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return Object.assign(file, {
    documentType: 'Insurance Certificate',
    title: 'Insurance certificate',
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    ...rest,
  }) as AircraftDocumentFile
}

const anExistingDocument = (overrides: Partial<AircraftDocument> = {}) =>
  ({
    documentId: 1,
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    documentType: 'Insurance Certificate',
    title: 'Existing insurance',
    fileName: 'existing.pdf',
    isActive: true,
    validFrom: '2025-01-01',
    validTo: '2025-12-31',
    ...overrides,
  }) as AircraftDocument

const listReturns = (documents: AircraftDocument[]) => {
  server.use(
    http.get(apiUrl('v1/aircraft-documents'), () =>
      HttpResponse.json({ documents, total: documents.length }),
    ),
  )
}

/**
 * Reads the multipart body by hand. `request.formData()` cannot be used here:
 * the upload carries a jsdom `File`, which undici's FormData parser rejects
 * because it is not undici's own `File` class.
 */
const parseMultipart = (body: string): Record<string, string> => {
  const fields: Record<string, string> = {}
  for (const part of body.split(/--+[\w-]+(?:--)?\r?\n?/)) {
    const separator = part.indexOf('\r\n\r\n')
    if (separator === -1) continue
    const name = /name="([^"]+)"/.exec(part.slice(0, separator))?.[1]
    if (name) fields[name] = part.slice(separator + 4).replace(/\r\n$/, '')
  }
  return fields
}

const uploadSucceeds = () => {
  const uploads: Record<string, string>[] = []
  server.use(
    http.post(apiUrl('v1/aircraft-documents'), async ({ request }) => {
      uploads.push(parseMultipart(await request.text()))
      return HttpResponse.json(
        anExistingDocument({ documentId: 99, title: 'Insurance certificate' }),
      )
    }),
  )
  return uploads
}

const renderUploader = (options: Parameters<typeof useAircraftDocumentUpload>[0]) =>
  renderHookWithProviders(() => useAircraftDocumentUpload(options))

beforeEach(() => {
  listReturns([])
  // The hook logs a debug line on every overlap check.
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('validateFile', () => {
  it('accepts a PDF within the size limit', () => {
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    expect(result.current.validateFile(aDocumentFile())).toBeNull()
  })

  it('rejects a file above the size limit', () => {
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    const error = result.current.validateFile(
      aDocumentFile({ size: DOCUMENT_CONSTANTS.MAX_FILE_SIZE + 1 }),
    )

    expect(error).toBeTruthy()
    expect(error).toContain('insurance.pdf')
  })

  it('honours a caller-supplied size limit', () => {
    const { result } = renderUploader({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      maxFileSize: 512,
    })

    expect(result.current.validateFile(aDocumentFile({ size: 1024 }))).toBeTruthy()
    expect(result.current.validateFile(aDocumentFile({ size: 256 }))).toBeNull()
  })

  it('rejects a disallowed content type', () => {
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    const error = result.current.validateFile(
      aDocumentFile({ name: 'notes.exe', type: 'application/x-msdownload' }),
    )

    expect(error).toBeTruthy()
    expect(error).toContain('notes.exe')
  })

  it('honours a caller-supplied type allowlist', () => {
    const { result } = renderUploader({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      allowedFileTypes: ['image/png'],
    })

    expect(result.current.validateFile(aDocumentFile({ type: 'application/pdf' }))).toBeTruthy()
    expect(result.current.validateFile(aDocumentFile({ type: 'image/png' }))).toBeNull()
  })
})

describe('validateDateOverlap', () => {
  const period = {
    documentType: 'Insurance Certificate' as AircraftDocumentType,
    aircraftRegistration: AIRCRAFT_REGISTRATION,
    validOnly: false,
    limit: 100,
    offset: 0,
  }

  it('passes when the document has no validity period', async () => {
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(result.current.validateDateOverlap({ ...period })).resolves.toBeNull()
  })

  it('passes when nothing else of that type exists', async () => {
    listReturns([])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(
      result.current.validateDateOverlap({
        ...period,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
      }),
    ).resolves.toBeNull()
  })

  it('reports an overlap with an existing document of the same type', async () => {
    listReturns([anExistingDocument()])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    const error = await result.current.validateDateOverlap({
      ...period,
      validFrom: new Date('2025-06-01'),
      validTo: new Date('2026-05-31'),
    })

    expect(error).toBeTruthy()
    expect(error).toContain('Existing insurance')
  })

  it('allows a period that starts after the existing one ends', async () => {
    listReturns([anExistingDocument()])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(
      result.current.validateDateOverlap({
        ...period,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
      }),
    ).resolves.toBeNull()
  })

  it('ignores documents of a different type', async () => {
    listReturns([anExistingDocument({ documentType: 'ARC' })])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(
      result.current.validateDateOverlap({
        ...period,
        validFrom: new Date('2025-06-01'),
        validTo: new Date('2026-05-31'),
      }),
    ).resolves.toBeNull()
  })

  it('never blocks on the catch-all "Other" type', async () => {
    listReturns([anExistingDocument({ documentType: 'Other' })])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(
      result.current.validateDateOverlap({
        ...period,
        documentType: 'Other',
        validFrom: new Date('2025-06-01'),
        validTo: new Date('2026-05-31'),
      }),
    ).resolves.toBeNull()
  })

  it('ignores inactive documents', async () => {
    listReturns([anExistingDocument({ isActive: false })])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(
      result.current.validateDateOverlap({
        ...period,
        validFrom: new Date('2025-06-01'),
        validTo: new Date('2026-05-31'),
      }),
    ).resolves.toBeNull()
  })

  it('ignores the document being edited', async () => {
    listReturns([anExistingDocument({ documentId: 7 })])
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await expect(
      result.current.validateDateOverlap(
        { ...period, validFrom: new Date('2025-06-01'), validTo: new Date('2026-05-31') },
        7,
      ),
    ).resolves.toBeNull()
  })
})

describe('uploadFile', () => {
  it('posts the file with its metadata and reports completion', async () => {
    const uploads = uploadSucceeds()
    const onUploadComplete = vi.fn()
    const { result } = renderUploader({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      onUploadComplete,
    })

    await act(async () => {
      await result.current.uploadFile(aDocumentFile({ description: 'Renewed cover' }))
    })

    expect(uploads).toHaveLength(1)
    expect(uploads[0].aircraftRegistration).toBe(AIRCRAFT_REGISTRATION)
    expect(uploads[0].documentType).toBe('Insurance Certificate')
    expect(uploads[0].title).toBe('Insurance certificate')
    expect(uploads[0].fileName).toBe('insurance.pdf')
    expect(uploads[0].description).toBe('Renewed cover')
    expect(uploads[0].isActive).toBe('true')
    expect(onUploadComplete).toHaveBeenCalledOnce()
  })

  it('omits optional metadata that was not supplied', async () => {
    const uploads = uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      await result.current.uploadFile(aDocumentFile())
    })

    expect(uploads[0].description).toBeUndefined()
    expect(uploads[0].validFrom).toBeUndefined()
  })

  it('tracks progress through to completion', async () => {
    uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      await result.current.uploadFile(aDocumentFile())
    })

    await waitFor(() => expect(result.current.progresses).toHaveLength(1))
    expect(result.current.progresses[0]).toMatchObject({
      fileName: 'insurance.pdf',
      progress: 100,
      status: 'completed',
    })
  })

  it('refuses an invalid file without calling the API', async () => {
    const uploads = uploadSucceeds()
    const onUploadError = vi.fn()
    const { result } = renderUploader({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      onUploadError,
    })

    await act(async () => {
      const uploaded = await result.current.uploadFile(
        aDocumentFile({ name: 'notes.exe', type: 'application/x-msdownload' }),
      )
      expect(uploaded).toBeNull()
    })

    expect(uploads).toHaveLength(0)
    expect(onUploadError).toHaveBeenCalledWith(expect.stringContaining('notes.exe'), 'notes.exe')
    await waitFor(() => expect(result.current.progresses[0].status).toBe('error'))
  })

  it('refuses a file whose validity overlaps an existing document', async () => {
    listReturns([anExistingDocument()])
    const uploads = uploadSucceeds()
    const onUploadError = vi.fn()
    const { result } = renderUploader({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      onUploadError,
    })

    await act(async () => {
      const uploaded = await result.current.uploadFile(
        aDocumentFile({ validFrom: '2025-06-01', validTo: '2026-05-31' }),
      )
      expect(uploaded).toBeNull()
    })

    expect(uploads).toHaveLength(0)
    expect(onUploadError).toHaveBeenCalled()
  })

  it('reports an API failure as an errored upload', async () => {
    server.use(http.post(apiUrl('v1/aircraft-documents'), () => problemResponse(413, 'Too large')))
    const onUploadError = vi.fn()
    const { result } = renderUploader({
      aircraftRegistration: AIRCRAFT_REGISTRATION,
      onUploadError,
    })

    await act(async () => {
      const uploaded = await result.current.uploadFile(aDocumentFile())
      expect(uploaded).toBeNull()
    })

    expect(onUploadError).toHaveBeenCalledWith('Too large', 'insurance.pdf')
    await waitFor(() => expect(result.current.progresses[0].status).toBe('error'))
  })

  it('overrides the file’s own registration with the uploader’s', async () => {
    const uploads = uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      await result.current.uploadFiles([aDocumentFile({ aircraftRegistration: 'OH-WRONG' })])
    })

    expect(uploads[0].aircraftRegistration).toBe(AIRCRAFT_REGISTRATION)
  })
})

describe('uploadFiles', () => {
  it('returns nothing and does not flip the flag for an empty list', async () => {
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      expect(await result.current.uploadFiles([])).toEqual([])
    })

    expect(result.current.isUploading).toBe(false)
  })

  it('uploads several files and returns the ones that succeeded', async () => {
    const uploads = uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      const uploaded = await result.current.uploadFiles([
        aDocumentFile({ name: 'one.pdf' }),
        aDocumentFile({ name: 'two.pdf' }),
      ])
      expect(uploaded).toHaveLength(2)
    })

    expect(uploads.map((form) => form.fileName)).toEqual(['one.pdf', 'two.pdf'])
  })

  it('carries on past a file that fails validation', async () => {
    const uploads = uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      const uploaded = await result.current.uploadFiles([
        aDocumentFile({ name: 'bad.exe', type: 'application/x-msdownload' }),
        aDocumentFile({ name: 'good.pdf' }),
      ])
      expect(uploaded).toHaveLength(1)
    })

    expect(uploads.map((form) => form.fileName)).toEqual(['good.pdf'])
  })

  it('clears the uploading flag once finished', async () => {
    uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      await result.current.uploadFiles([aDocumentFile()])
    })

    expect(result.current.isUploading).toBe(false)
  })
})

describe('clearCompleted', () => {
  it('drops completed rows but keeps the errored ones on screen', async () => {
    uploadSucceeds()
    const { result } = renderUploader({ aircraftRegistration: AIRCRAFT_REGISTRATION })

    await act(async () => {
      await result.current.uploadFile(aDocumentFile({ name: 'good.pdf' }))
      await result.current.uploadFile(
        aDocumentFile({ name: 'bad.exe', type: 'application/x-msdownload' }),
      )
    })

    await waitFor(() => expect(result.current.progresses).toHaveLength(2))

    act(() => result.current.clearCompleted())

    expect(result.current.progresses).toHaveLength(1)
    expect(result.current.progresses[0]).toMatchObject({ fileName: 'bad.exe', status: 'error' })
  })
})
