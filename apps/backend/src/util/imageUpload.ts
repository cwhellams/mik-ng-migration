import sharp from 'sharp'
import { problem } from '../routes/response.ts'

// Shared by every image-accepting upload route (expense receipts, event images,
// occurrence attachments, instructor qualification proofs, member/aircraft documents).
// A single place to fix issue #1075: the raw multer size cap (see
// IMAGE_UPLOAD_RAW_BYTES) must comfortably exceed a real, uncompressed phone photo, so
// compression below actually gets a chance to run instead of the upload being rejected
// before sharp ever sees it.
export const IMAGE_UPLOAD_RAW_BYTES = 40 * 1024 * 1024 // 40 MB — raw upload ceiling, not the user-facing limit

interface CompressOptions {
  maxWidth: number
  maxHeight: number
  targetBytes: number
}

/**
 * Rotates (EXIF-aware), resizes, and JPEG-compresses an uploaded image to fit under
 * `targetBytes`, retrying once at a lower quality if needed. Throws a 400 problem (via
 * the shared `problem()` helper) if it still doesn't fit after the retry.
 */
export async function compressImageForUpload(
  buffer: Buffer,
  { maxWidth, maxHeight, targetBytes }: CompressOptions,
): Promise<Buffer> {
  const buildImage = () =>
    sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })

  let out = await buildImage().jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  if (out.length > targetBytes) {
    out = await buildImage().jpeg({ quality: 70, mozjpeg: true }).toBuffer()
  }

  if (out.length > targetBytes) {
    return problem({
      status: 400,
      detail: `Image is too large after compression (max ${(targetBytes / 1024 / 1024).toFixed(1)} MB). Please upload a smaller image.`,
    })
  }

  return out
}
