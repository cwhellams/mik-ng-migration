/**
 * Common utility functions and constants for aircraft document handling
 */

/**
 * Document-related constants
 */
export const DOCUMENT_CONSTANTS = {
  EXPIRING_DAYS_THRESHOLD: 30,
  DEFAULT_LIMIT: 100,
  DEFAULT_OFFSET: 0,
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
} as const

/**
 * Default allowed file types for document uploads
 */
export const DEFAULT_ALLOWED_FILE_TYPES = [
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
] as const

/**
 * Maps a MIME type to an appropriate icon identifier
 * @param mimeType - The MIME type of the file (optional)
 * @returns Icon identifier string for use with iconify
 */
export const getFileIcon = (mimeType?: string | null): string => {
  if (!mimeType) return 'mdi:file'
  if (mimeType.includes('pdf')) return 'mdi:file-pdf-box'
  if (mimeType.includes('word') || mimeType.includes('document'))
    return 'mdi:file-word-box'
  if (mimeType.includes('excel') || mimeType.includes('sheet'))
    return 'mdi:file-excel-box'
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation'))
    return 'mdi:file-powerpoint-box'
  if (mimeType.includes('image')) return 'mdi:file-image'
  if (mimeType.includes('text')) return 'mdi:file-document'
  return 'mdi:file'
}

/**
 * Formats a file size in bytes to a human-readable string
 * @param bytes - The file size in bytes (optional)
 * @returns Formatted string like "1.5 MB" or empty string if undefined
 */
export const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes === 0) return bytes === 0 ? '0 Bytes' : ''
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
