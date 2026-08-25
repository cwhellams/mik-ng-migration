import multer from 'multer'
import { compressImageForUpload, IMAGE_UPLOAD_RAW_BYTES } from './imageUpload.ts'
import { problem } from '../routes/response.ts'

/**
 * Receipt handling shared by every route that stores a member's own document as
 * proof of payment: expense claim attachments, and a liquid record's own receipt
 * captured at report time (which is later copied onto the claim built from it).
 * Both accept an image or a PDF and land in the same bucket -- a liquid-record
 * receipt and a claim receipt are the same document at different points in its
 * life, so there is exactly one bucket and one compression policy for it.
 */

export const RECEIPT_BUCKET =
  process.env.EXPENSE_RECEIPT_BUCKET ??
  (process.env.NODE_ENV === 'production' ? 'mik-expense-receipts' : 'mik-expense-receipts-test')

export const MAX_RECEIPT_BYTES = 1 * 1024 * 1024 // 1 MB — post-compression image limit
export const MAX_PDF_BYTES = 5 * 1024 * 1024 // 5 MB — PDF size limit

export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_RAW_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only image files or PDF documents are allowed for receipts'))
    }
  },
})

export const sanitizeFileName = (fileName: string): string => {
  const sanitized = fileName
    .replace(/\.[^.]+$/, '')
    .replaceAll(/[^a-zA-Z0-9_-]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

  return sanitized || 'receipt'
}

export async function processReceipt(
  file: Express.Multer.File,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  if (file.mimetype === 'application/pdf') {
    if (file.buffer.length > MAX_PDF_BYTES) {
      problem({
        status: 400,
        detail: `PDF receipt is too large (max ${MAX_PDF_BYTES / 1024 / 1024} MB).`,
      })
    }
    const safeName = `${sanitizeFileName(file.originalname)}.pdf`
    return { buffer: file.buffer, fileName: safeName, mimeType: 'application/pdf' }
  }

  const buffer = await compressImageForUpload(file.buffer, {
    maxWidth: 2000,
    maxHeight: 2000,
    targetBytes: MAX_RECEIPT_BYTES,
  })

  return {
    buffer,
    fileName: `${sanitizeFileName(file.originalname)}.jpg`,
    mimeType: 'image/jpeg',
  }
}
