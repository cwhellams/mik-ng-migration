import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  getAllAircraftDocuments,
  countAircraftDocuments,
  getAircraftDocumentById,
  addAircraftDocument,
  updateAircraftDocument,
  removeAircraftDocument,
} from '../../db/aircraft-document-queries.ts'
import { getAircraftByRegistration } from '../../db/aircraft-queries.ts'
import { problem } from '../response.ts'
import { storageService, type UploadResult } from '../../services/storage.ts'
import {
  AircraftDocumentFiltersSchema,
  AircraftDocumentSchema,
  AircraftDocumentUploadSchema,
  type AircraftDocument,
  type AircraftDocumentAuditable,
  type AircraftDocumentFilters,
  type AircraftDocumentListResponse,
} from './models.ts'
import { validateDocumentId, type DownloadDocument } from '../documents/models.ts'
import logger from '../../lib/logger.ts'
import { documentUpload, getDocument, processDocumentFile } from '../../util/documentHelper.ts'

export const router = Router()

/**
 * Validates aircraft registration and returns safe bucket name
 * Prevents type confusion and injection attacks
 * @param registration - Aircraft registration from user input
 * @returns Bucket name if valid, throws error if invalid
 */
const getValidatedBucketName = async (registration: unknown): Promise<string> => {
  // Type check: ensure registration is a string
  if (typeof registration !== 'string' || !registration.trim()) {
    throw new Error('Invalid aircraft registration: must be a non-empty string')
  }

  const trimmedRegistration = registration.trim()

  // Validate registration format (typical format: OH-XXX or similar)
  if (!/^[A-Z0-9-]{3,10}$/i.test(trimmedRegistration)) {
    throw new Error('Invalid aircraft registration format')
  }

  // Verify aircraft exists in database
  const aircraft = await getAircraftByRegistration(trimmedRegistration, false)
  if (!aircraft) {
    throw new Error('Aircraft not found')
  }

  // Use static method if available, otherwise construct safely
  if ((storageService as any).constructor.getAircraftBucketName) {
    return (storageService as any).constructor.getAircraftBucketName(aircraft.registration)
  }

  // Safe construction: we've validated the registration exists
  return `mik-ac-${aircraft.registration.slice(-3).toLowerCase()}`
}

// All aircraft document routes require at least MEMBER permission or DOCUMENT_ADMIN permission
router.use(validateUser(MIKPermissions.MEMBER, MIKPermissions.DOCUMENT_ADMIN))

router.get('/download', async (req: Request, res: Response<DownloadDocument>) => {
  const documentId = validateDocumentId(req.query.id as string)
  if (typeof documentId !== 'number') return documentId

  const document = await getAircraftDocumentById(documentId)

  if (!document) {
    return problem({ status: 404, detail: 'Aircraft document not found' })
  }

  const bucketName = await getValidatedBucketName(document.aircraftRegistration)

  const result = await getDocument(documentId, req.user!, 'aircraft', bucketName)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json(result)
})

// Get all aircraft documents
router.get(
  '/',
  async (
    req: Request<never, AircraftDocumentListResponse, never, AircraftDocumentFilters>,
    res: Response<AircraftDocumentListResponse>,
  ) => {
    const filters = AircraftDocumentFiltersSchema.parse(req.query)

    const [documents, total] = await Promise.all([
      getAllAircraftDocuments(filters),
      countAircraftDocuments(filters),
    ])

    res.status(200).json({
      documents,
      total,
    })
  },
)

// Get aircraft document by ID
router.get(
  '/:documentId',
  async (req: Request<{ documentId: string }>, res: Response<AircraftDocument>) => {
    const documentId = Number.parseInt(req.params.documentId, 10)
    if (Number.isNaN(documentId)) {
      return problem({ status: 400, detail: 'Invalid document ID' })
    }

    const document = await getAircraftDocumentById(documentId)
    if (!document) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    res.status(200).json(document)
  },
)

// Update aircraft document (admin only)
router.patch(
  '/:documentId',
  validateUser(MIKPermissions.DOCUMENT_ADMIN),
  async (req: Request<{ documentId: string }>, res: Response<AircraftDocument>) => {
    const documentId = Number.parseInt(req.params.documentId, 10)
    if (Number.isNaN(documentId)) {
      return problem({ status: 400, detail: 'Invalid document ID' })
    }

    const patch = AircraftDocumentSchema.partial().parse(req.body)
    const success = await updateAircraftDocument(documentId, patch, req.user!)

    if (!success) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    const updated = await getAircraftDocumentById(documentId)
    if (!updated) {
      return problem({ status: 404, detail: 'Aircraft document not found after update' })
    }

    res.status(200).json(updated)
  },
)

// Delete aircraft document (admin only)
router.delete(
  '/:documentId',
  validateUser(MIKPermissions.DOCUMENT_ADMIN),
  async (req: Request<{ documentId: string }>, res: Response) => {
    const documentId = Number.parseInt(req.params.documentId, 10)
    if (Number.isNaN(documentId)) {
      return problem({ status: 400, detail: 'Invalid document ID' })
    }

    // Get document to retrieve storage key for file deletion
    const document = await getAircraftDocumentById(documentId)
    if (!document) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    // Delete file from storage if it exists
    if (document.storageKey) {
      try {
        const bucketName = await getValidatedBucketName(document.aircraftRegistration)
        await storageService.deleteFile(document.storageKey, bucketName)
      } catch (error) {
        logger.error('Failed to delete file from storage:', error)
        // Continue with database deletion even if file deletion fails
      }
    }

    const removed = await removeAircraftDocument(documentId)
    if (!removed) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    res.status(204).end()
  },
)

// Upload file and create aircraft document (admin only)
router.post(
  '/',
  validateUser(MIKPermissions.DOCUMENT_ADMIN),
  documentUpload.single('file'),
  async (
    req: Request<never, AircraftDocumentAuditable, AircraftDocument>,
    res: Response<AircraftDocumentAuditable>,
  ) => {
    if (!req.file) {
      return problem({ status: 400, detail: 'No file uploaded' })
    }

    // Validate and parse request body against upload schema to ensure type safety
    const validatedDoc = AircraftDocumentUploadSchema.parse(req.body)

    try {
      // Validate aircraft registration and get bucket name
      const bucketName = await getValidatedBucketName(validatedDoc.aircraftRegistration)

      // Safely convert document type to folder name (documentType is guaranteed to be a string by Zod)
      const folderName = validatedDoc.documentType.toLowerCase().replaceAll(/\s+/g, '-')
      const processed = await processDocumentFile(req.file)
      const fileName =
        processed.mimetype !== req.file.mimetype
          ? `${req.file.originalname.replace(/\.[^.]+$/, '')}.jpg`
          : req.file.originalname

      // Upload file to aircraft-specific bucket with document type as folder
      const uploadResult: UploadResult = await storageService.uploadFile(
        processed.buffer,
        fileName,
        processed.mimetype,
        folderName,
        bucketName,
      )

      // Create aircraft document record
      const documentData = {
        ...validatedDoc,
        documentUrl: uploadResult.url,
        fileName,
        fileSize: processed.buffer.length,
        mimeType: processed.mimetype,
        storageKey: uploadResult.key,
      }
      const created = await addAircraftDocument(documentData, req.user!)

      res.status(201).json(created)
    } catch (error) {
      logger.error('Aircraft document upload failed:', error)
      return problem({
        status: 500,
        detail: 'Failed to upload aircraft document. Please try again.',
      })
    }
  },
)
