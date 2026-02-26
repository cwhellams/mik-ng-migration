import { getDocumentById } from '../db/document-queries.ts'
import { getAircraftDocumentById } from '../db/aircraft-document-queries.ts'
import { createTinyUrl } from '../db/tiny-url-queries.ts'
import { problem } from '../routes/response.ts'
import { storageService } from '../services/storage.ts'
import { docUrlTtlSecs, generateQRCodeWithLogo } from '../services/tinyUrl.ts'
import logger from '../lib/logger.ts'
import multer from 'multer'
import type { DownloadDocument } from '../routes/documents/models.ts'
import type { JWTUser } from '../routes/auth/token.ts'

export async function getDocument(
  documentId: number,
  user: JWTUser,
  documentType: 'member' | 'aircraft',
  bucketName?: string,
): Promise<DownloadDocument> {
  const document =
    documentType === 'member'
      ? await getDocumentById(documentId)
      : await getAircraftDocumentById(documentId)

  if (!document) {
    return problem({ status: 404, detail: 'Document not found' })
  }

  if (!document.storageKey) {
    return problem({ status: 404, detail: 'Document file not found' })
  }

  try {
    const presignedUrl = await storageService.getPresignedUrl(
      document.storageKey,
      docUrlTtlSecs,
      bucketName,
    )

    const shortCode = await createTinyUrl(
      {
        documentId: documentType === 'member' ? documentId : undefined,
        aircraftDocumentId: documentType === 'aircraft' ? documentId : undefined,
        documentType,
        presignedUrl,
      },
      user,
    )
    const tinyUrlBaseUrl =
      process.env.TINY_URL_BASE_URL ??
      process.env.PUBLIC_URL ??
      process.env.BACKEND_URL ??
      'http://localhost:3000'
    const tinyUrl = `${tinyUrlBaseUrl.replace(/\/+$/, '')}/t/${shortCode}`
    const qrCode = await generateQRCodeWithLogo(tinyUrl)

    return { tinyUrl, qrCode }
  } catch (error) {
    logger.error('Failed to generate presigned URL:', error)
    return problem({ status: 500, detail: 'Failed to generate download link' })
  }
}

// Configure multer for file uploads
export const documentUpload = multer({
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
