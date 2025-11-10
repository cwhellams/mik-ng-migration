import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  DocumentFiltersSchema,
  DocumentSchema,
  DownloadDocument,
  type Document,
  type DocumentFilters,
  type DocumentListResponse,
} from './models.ts'
import {
  getAllDocuments,
  countDocuments,
  getDocumentById,
  addDocument,
  updateDocument,
  removeDocument,
  getDocumentStorageKeyById,
} from '../../db/document-queries.ts'
import { UpsertSchema } from '../../types/schema.ts'
import { problem } from '../response.ts'
import { storageService, type UploadResult } from '../../services/storage.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

// Configure multer for file uploads
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

// All document routes require at least MEMBER permission or DOCUMENT_ADMIN permission
router.use(
  validateUser(MIKPermissions.MEMBER, MIKPermissions.DOCUMENT_USER, MIKPermissions.DOCUMENT_ADMIN),
)

router.get('/download', async (req: Request, res: Response<DownloadDocument>) => {
  const documentId = parseInt(req.query.id as string, 10)
  if (isNaN(documentId)) {
    return problem({ status: 400, detail: 'Invalid document ID' })
  }

  const document = await getDocumentById(documentId)
  if (!document) {
    return problem({ status: 404, detail: 'Document not found' })
  }

  if (!document.storageKey) {
    return problem({ status: 404, detail: 'Document file not found' })
  }

  try {
    const presignedUrl = await storageService.getPresignedUrl(document.storageKey, 60)
    const payload = { documentId: documentId, presignedUrl }
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(payload)
  } catch (error) {
    logger.error('Failed to generate presigned URL:', error)
    return problem({ status: 500, detail: 'Failed to generate download link' })
  }
})

// Get all documents
router.get(
  '/',
  async (
    req: Request<never, DocumentListResponse, never, DocumentFilters>,
    res: Response<DocumentListResponse>,
  ) => {
    const filters = DocumentFiltersSchema.parse(req.query)

    const [documents, total] = await Promise.all([
      getAllDocuments(filters),
      countDocuments(filters),
    ])

    res.status(200).json({
      documents,
      total,
    })
  },
)

// Get document by ID
router.get(
  '/:documentId',
  async (req: Request<{ documentId: string }>, res: Response<Document>) => {
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(documentId)) {
      return problem({ status: 400, detail: 'Invalid document ID' })
    }

    const document = await getDocumentById(documentId)

    if (!document) {
      return problem({ status: 404, detail: 'Document not found' })
    }

    if (!document.storageKey) {
      return problem({ status: 404, detail: 'Document file not found' })
    }

    res.status(200).json(document)
  },
)

// Update document (admin only)
router.patch(
  '/:documentId',
  validateUser(MIKPermissions.DOCUMENT_ADMIN),
  async (req: Request<{ documentId: string }>, res: Response<Document>) => {
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(documentId)) {
      return problem({ status: 400, detail: 'Invalid document ID' })
    }

    const patch = DocumentSchema.partial().parse(req.body)
    const success = await updateDocument(documentId, patch, req.user!)

    if (!success) {
      return problem({ status: 404, detail: 'Document not found' })
    }

    const updated = await getDocumentById(documentId)
    if (!updated) {
      return problem({ status: 404, detail: 'Document not found after update' })
    }

    res.status(200).json(updated)
  },
)

// Delete document (admin only)
router.delete(
  '/:documentId',
  validateUser(MIKPermissions.DOCUMENT_ADMIN),
  async (req: Request<{ documentId: string }>, res: Response) => {
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(documentId)) {
      return problem({ status: 400, detail: 'Invalid document ID' })
    }

    // Get document to retrieve storage key for file deletion
    const storageKey = await getDocumentStorageKeyById(documentId)
    if (!storageKey) {
      return problem({ status: 404, detail: 'Document not found' })
    }

    // Delete file from storage if it exists
    if (storageKey) {
      try {
        await storageService.deleteFile(storageKey)
        const removed = await removeDocument(documentId)
        if (!removed) {
          return problem({ status: 404, detail: 'Document not found' })
        }

        res.status(204).end()
      } catch (error) {
        logger.error('Failed to delete file from storage:', error)
        res.status(500).json({ message: 'Failed to delete file from storage' })
      }
    }
  },
)

// Upload file and create document (admin only)
router.post(
  '/',
  validateUser(MIKPermissions.DOCUMENT_ADMIN),
  upload.single('file'),
  async (req: Request, res: Response<Document>) => {
    if (!req.file) {
      return problem({ status: 400, detail: 'No file uploaded' })
    }

    const {
      title,
      description,
      category,
      publishedDate,
      isPublic = true,
      tags = '[]',
      isArchived = false,
    } = req.body

    if (!title || !category || !publishedDate) {
      return problem({
        status: 400,
        detail: 'Missing required fields: title, category, publishedDate',
      })
    }

    // Parse tags from JSON string
    let parsedTags: string[] = []
    try {
      if (typeof tags === 'string' && tags) {
        parsedTags = JSON.parse(tags)
      } else if (Array.isArray(tags)) {
        parsedTags = tags
      }
    } catch (error) {
      logger.error('Document POST - Invalid tags format:', error)
      parsedTags = []
    }

    try {
      // Upload file to Digital Ocean Spaces with category as folder
      const uploadResult: UploadResult = await storageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        category.toLowerCase(), // Use category as folder name
      )

      // Create document record
      const documentData = {
        title,
        description: description || null,
        category,
        documentUrl: uploadResult.url,
        publishedDate,
        isPublic: isPublic === 'true' || isPublic === true,
        isArchived: isArchived === 'true' || isArchived === true,
        tags: parsedTags,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageKey: uploadResult.key,
      }

      const document = UpsertSchema(DocumentSchema).parse(documentData)
      const created = await addDocument(document, req.user!)

      res.status(201).json(created)
    } catch (error) {
      logger.error('File upload failed:', error)
      return problem({
        status: 500,
        detail: 'Failed to upload file. Please try again.',
      })
    }
  },
)
