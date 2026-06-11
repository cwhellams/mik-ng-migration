import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import useApi from './useApi'
import {
  AircraftDocument,
  AircraftDocumentAuditable,
  AircraftDocumentFilters,
  AircraftDocumentListResponse,
  AircraftDocumentType,
} from '@backend/routes/aircraft-documents/models'
import { DOCUMENT_CONSTANTS, DEFAULT_ALLOWED_FILE_TYPES } from '../utils/documentHelpers'

export interface AircraftDocumentFile extends File {
  documentType: AircraftDocumentType
  title: string
  description?: string
  validFrom?: string
  validTo?: string
  aircraftRegistration: string
}

export interface UploadProgress {
  fileId: string
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

export interface UseAircraftDocumentUploadOptions {
  aircraftRegistration: string
  onUploadComplete?: (document: AircraftDocument) => void
  onUploadError?: (error: string, fileName: string) => void
  maxFileSize?: number // in bytes, default 50MB
  allowedFileTypes?: readonly string[]
}

export const useAircraftDocumentUpload = ({
  aircraftRegistration,
  onUploadComplete,
  onUploadError,
  maxFileSize = DOCUMENT_CONSTANTS.MAX_FILE_SIZE,
  allowedFileTypes = DEFAULT_ALLOWED_FILE_TYPES as readonly string[],
}: UseAircraftDocumentUploadOptions) => {
  const { t } = useTranslation()
  const [uploadProgresses, setUploadProgresses] = useState<Map<string, UploadProgress>>(new Map())
  const [isUploading, setIsUploading] = useState(false)

  const filters = useMemo<AircraftDocumentFilters>(
    () => ({
      aircraftRegistration,
      limit: DOCUMENT_CONSTANTS.DEFAULT_LIMIT,
      offset: DOCUMENT_CONSTANTS.DEFAULT_OFFSET,
    }),
    [aircraftRegistration],
  )

  const {
    //data,
    fetch,
    //error
    //isLoading
  } = useApi<AircraftDocumentListResponse>({
    url: 'v1/aircraft-documents',
    params: filters,
  })

  const { mutation: uploadMutation } = useApi<AircraftDocumentAuditable>({
    method: 'POST',
    url: 'v1/aircraft-documents',
    skipFetch: true,
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  // Validate file before upload
  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxFileSize) {
        return t('aircraft.document.upload.error.fileSize', {
          fileName: file.name,
          maxSize: `${Math.round(maxFileSize / (1024 * 1024))}MB`,
        })
      }

      if (!allowedFileTypes.includes(file.type)) {
        return t('aircraft.document.upload.error.fileType', {
          fileName: file.name,
          allowedTypes: allowedFileTypes.join(', '),
        })
      }

      return null
    },
    [maxFileSize, allowedFileTypes, t],
  )

  // Check for validity date overlaps
  const validateDateOverlap = useCallback(
    async (
      docFilter: AircraftDocumentFilters,
      excludeDocumentId?: number,
    ): Promise<string | null> => {
      const { validFrom, validTo, documentType } = docFilter
      if (!validFrom || !validTo) return null

      console.log('Validating date overlap with filters:', filters)

      const { data } = await fetch.trigger('GET', filters, undefined)

      try {
        const existingDocs = (data?.documents ?? []).filter(
          (doc: AircraftDocument) => doc.documentId !== excludeDocumentId && doc.isActive,
        )

        for (const doc of existingDocs) {
          const isOtherType = documentType === 'Other' || doc.documentType === 'Other'
          const isSameType = doc.documentType === documentType

          if (isOtherType || !isSameType) continue

          if (doc.validFrom && doc.validTo) {
            const newStart = new Date(validFrom)
            const newEnd = new Date(validTo)
            const existingStart = new Date(doc.validFrom)
            const existingEnd = new Date(doc.validTo)

            // Check for overlap
            if (newStart <= existingEnd && newEnd >= existingStart) {
              return t('aircraft.document.upload.error.dateOverlap', {
                documentType,
                existingTitle: doc.title,
                existingPeriod: `${doc.validFrom} - ${doc.validTo}`,
              })
            }
          }
        }
      } catch (error) {
        console.warn('Failed to validate date overlap:', error)
      }

      return null
    },
    [fetch, filters, t],
  )

  // Update progress for a specific file
  const updateProgress = useCallback((fileId: string, update: Partial<UploadProgress>) => {
    setUploadProgresses((prev) => {
      const newMap = new Map(prev)
      const current = newMap.get(fileId)
      if (current) {
        newMap.set(fileId, { ...current, ...update })
      }
      return newMap
    })
  }, [])

  // Upload a single file
  const uploadFile = useCallback(
    async (file: AircraftDocumentFile): Promise<AircraftDocument | null> => {
      const fileId = `${file.name}-${Date.now()}`

      // Initialize progress tracking
      setUploadProgresses((prev) =>
        new Map(prev).set(fileId, {
          fileId,
          fileName: file.name,
          progress: 0,
          status: 'pending',
        }),
      )

      try {
        // Validate file
        const fileError = validateFile(file)
        if (fileError) {
          updateProgress(fileId, { status: 'error', error: fileError })
          onUploadError?.(fileError, file.name)
          return null
        }

        // Validate date overlap if dates are provided
        if (file.validFrom && file.validTo) {
          const vf = new Date(file.validFrom)
          const overlapError = await validateDateOverlap({
            documentType: file.documentType,
            validFrom: vf,
            validTo: new Date(file.validTo),
            aircraftRegistration: file.aircraftRegistration,
            validOnly: false,
            limit: 100,
            offset: 0,
          })

          if (overlapError) {
            updateProgress(fileId, { status: 'error', error: overlapError })
            onUploadError?.(overlapError, file.name)
            return null
          }
        }

        updateProgress(fileId, { status: 'uploading', progress: 10 })

        // Prepare form data
        const formData = new FormData()
        formData.append('file', file)
        formData.append('aircraftRegistration', aircraftRegistration)
        formData.append('documentType', file.documentType)
        formData.append('title', file.title)
        formData.append('fileName', file.name)
        if (file.description) formData.append('description', file.description)
        if (file.validFrom) formData.append('validFrom', file.validFrom)
        if (file.validTo) formData.append('validTo', file.validTo)
        formData.append('isActive', 'true')

        updateProgress(fileId, { progress: 30 })

        const response = await uploadMutation.trigger('POST', formData)

        updateProgress(fileId, { progress: 80 })

        if (response.error) {
          throw new Error(response.error.detail || `HTTP ${response.error.status}`)
        }

        const document: AircraftDocumentAuditable | undefined = response.data

        updateProgress(fileId, { progress: 100, status: 'completed' })

        if (document) {
          onUploadComplete?.(document)
          return document
        }

        return null
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        updateProgress(fileId, { status: 'error', error: errorMessage })
        onUploadError?.(errorMessage, file.name)
        return null
      }
    },
    [
      validateFile,
      updateProgress,
      aircraftRegistration,
      uploadMutation,
      onUploadError,
      validateDateOverlap,
      onUploadComplete,
    ],
  )

  // Upload multiple files
  const uploadFiles = useCallback(
    async (files: AircraftDocumentFile[]): Promise<AircraftDocument[]> => {
      if (files.length === 0) return []

      setIsUploading(true)
      const results: AircraftDocument[] = []

      try {
        // Upload files sequentially (could be parallel, but this is safer for validation)
        for (const file of files) {
          file.aircraftRegistration = aircraftRegistration
          const result = await uploadFile(file)
          if (result) {
            results.push(result)
          }
        }
      } finally {
        setIsUploading(false)
      }

      return results
    },
    [aircraftRegistration, uploadFile],
  )

  // Clear completed uploads from progress tracking
  const clearCompleted = useCallback(() => {
    setUploadProgresses((prev) => {
      const newMap = new Map()
      for (const [key, progress] of prev) {
        if (progress.status !== 'completed') {
          newMap.set(key, progress)
        }
      }
      return newMap
    })
  }, [])

  // Get current upload progresses as array
  const progresses = Array.from(uploadProgresses.values())

  return {
    uploadFile,
    uploadFiles,
    validateFile,
    validateDateOverlap,
    progresses,
    isUploading,
    clearCompleted,
  }
}
