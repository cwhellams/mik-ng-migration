import { getDocumentById } from '../db/document-queries.ts'
import { getAircraftDocumentById } from '../db/aircraft-document-queries.ts'
import { createTinyUrl } from '../db/tiny-url-queries.ts'
import { problem } from '../routes/response.ts'
import { storageService } from '../services/storage.ts'
import { docUrlTtlSecs, generateQRCodeWithLogo } from '../services/tinyUrl.ts'
import logger from '../lib/logger.ts'
import multer from 'multer'
import type { DownloadDocument } from '@mik/contracts/documents'
import type { JWTUser } from '../routes/auth/token.ts'
import { compressImageForUpload } from './imageUpload.ts'

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

const DOCUMENT_IMAGE_COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_DOCUMENT_IMAGE_BYTES = 2 * 1024 * 1024 // 2 MB — post-compression limit

/**
 * Compresses an uploaded document image the same way as every other image upload
 * surface (issue #1075) — this route previously stored images completely uncompressed.
 * Non-image files (PDF, Office docs, etc.) and animated GIFs pass through unchanged.
 */
export async function processDocumentFile(
  file: Express.Multer.File,
): Promise<{ buffer: Buffer; mimetype: string }> {
  if (!DOCUMENT_IMAGE_COMPRESSIBLE_TYPES.has(file.mimetype)) {
    return { buffer: file.buffer, mimetype: file.mimetype }
  }
  const buffer = await compressImageForUpload(file.buffer, {
    maxWidth: 2000,
    maxHeight: 2000,
    targetBytes: MAX_DOCUMENT_IMAGE_BYTES,
  })
  return { buffer, mimetype: 'image/jpeg' }
}

// Configure multer for file uploads. The 50MB raw limit stays generous — this route
// also accepts large PDFs/Office documents that must pass through unmodified, unlike
// the image-only upload surfaces elsewhere that had their raw cap raised for issue
// #1075 (this one was never the bottleneck: 50MB already comfortably exceeds a raw
// phone photo).
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
