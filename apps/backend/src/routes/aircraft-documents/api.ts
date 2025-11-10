import { Router, type Request, type Response } from 'express'
import multer from 'multer'
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
import { problem } from '../response.ts'
import { storageService, type UploadResult } from '../../services/storage.ts'
import {
  AircraftDocumentFiltersSchema,
  AircraftDocumentSchema,
  type AircraftDocument,
  type AircraftDocumentAuditable,
  type AircraftDocumentFilters,
  type AircraftDocumentListResponse,
} from './models.ts'
import type { DownloadDocument } from '../documents/models.ts'
import logger from '../../lib/logger.ts'
//import type { Aircraft, AircraftAlert } from '../aircrafts/models.ts'

export const router = Router()

// Configure multer for file uploads (same as general documents)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept common document types
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new Error(
          'Invalid file type. Only documents, spreadsheets, presentations, text files, and images are allowed.',
        ),
      )
    }
  },
})

// All aircraft document routes require at least MEMBER permission or DOCUMENT_ADMIN permission
router.use(validateUser(MIKPermissions.MEMBER, MIKPermissions.DOCUMENT_ADMIN))

router.get('/download', async (req: Request, res: Response<DownloadDocument>) => {
  const documentId = parseInt(req.query.id as string, 10)
  if (isNaN(documentId)) {
    return problem({ status: 400, detail: 'Invalid document ID' })
  }

  const document = await getAircraftDocumentById(documentId)
  if (!document) {
    return problem({ status: 404, detail: 'Document not found' })
  }

  if (!document.storageKey) {
    return problem({ status: 404, detail: 'Document file not found' })
  }

  const bucketName = (storageService as any).constructor.getAircraftBucketName
    ? (storageService as any).constructor.getAircraftBucketName(document.aircraftRegistration)
    : `mik-ac-${document.aircraftRegistration.slice(-3).toLowerCase()}`

  try {
    const presignedUrl = await storageService.getPresignedUrl(document.storageKey, 60, bucketName)
    const payload = { documentId: documentId, presignedUrl }
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(payload)
  } catch (error) {
    logger.error('Failed to generate presigned URL:', error)
    return problem({ status: 500, detail: 'Failed to generate download link' })
  }
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
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(documentId)) {
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
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(documentId)) {
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
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(documentId)) {
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
        // Get aircraft bucket name using the static method we added
        const bucketName = (storageService as any).constructor.getAircraftBucketName
          ? (storageService as any).constructor.getAircraftBucketName(document.aircraftRegistration)
          : `mik-ac-${document.aircraftRegistration.slice(-3).toLowerCase()}`

        await storageService.deleteFile(document.storageKey, bucketName)
      } catch (error) {
        console.error('Failed to delete file from storage:', error)
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
  upload.single('file'),
  async (
    req: Request<never, AircraftDocumentAuditable, AircraftDocument>,
    res: Response<AircraftDocumentAuditable>,
  ) => {
    if (!req.file) {
      return problem({ status: 400, detail: 'No file uploaded' })
    }

    const aircraftDoc = req.body

    try {
      // Get aircraft bucket name using the static method we added
      const bucketName = (storageService as any).constructor.getAircraftBucketName
        ? (storageService as any).constructor.getAircraftBucketName(
            aircraftDoc.aircraftRegistration,
          )
        : `mik-ac-${aircraftDoc.aircraftRegistration.slice(-3).toLowerCase()}`

      // Upload file to aircraft-specific bucket with document type as folder
      const uploadResult: UploadResult = await storageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        aircraftDoc.documentType.toLowerCase().replace(/\s+/g, '-'), // Convert "Noise Certificate" to "noise-certificate"
        bucketName,
      )

      // Create aircraft document record
      const documentData = {
        ...aircraftDoc,
        documentUrl: uploadResult.url,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageKey: uploadResult.key,
      }

      const created = await addAircraftDocument(documentData, req.user!)

      res.status(201).json(created)
    } catch (error) {
      console.error('Aircraft document upload failed:', error)
      return problem({
        status: 500,
        detail: 'Failed to upload aircraft document. Please try again.',
      })
    }
  },
)
