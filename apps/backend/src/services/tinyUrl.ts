/**
 * Tiny URL Service
 *
 * Generates and manages short URLs for document access.
 * Short codes are 9 characters long, URL-safe, and case-sensitive.
 */

import path from 'node:path'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import sharp from 'sharp'
import logger from '../lib/logger.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function findExistingFile(paths: string[]): Promise<string | undefined> {
  for (const filePath of paths) {
    try {
      await access(filePath)
      return filePath
    } catch {
      // Continue checking next candidate
    }
  }

  return undefined
}

async function resolveMikLogoPath(): Promise<string | undefined> {
  const candidatePaths = [
    process.env.MIK_LOGO_PATH,
    path.join(__dirname, '..', 'assets', 'mik-logo-blue.png'),
    path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'assets', 'mik-logo-blue.png'),
    path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'mik-logo-blue.png'),
    path.join(process.cwd(), 'apps', 'frontend', 'public', 'mik-logo-blue.png'),
    path.join(process.cwd(), 'apps', 'frontend', 'src', 'assets', 'mik-logo-blue.png'),
  ].filter((p): p is string => Boolean(p))

  return findExistingFile(candidatePaths)
}

/**
 * Calculate expiration timestamp for a tiny URL
 *
 * @param minutes - Number of minutes until expiration (default: 10)
 * @returns Date object representing expiration time
 */
export function calculateExpiration(): Date {
  const now = new Date()
  return new Date(now.getTime() + docUrlTtlSecs * 1000)
}

/**
 * Validate if a short code has the correct format
 *
 * @param shortCode - The short code to validate
 * @returns True if valid, false otherwise
 */
export function isValidShortCode(shortCode: string): boolean {
  // Must be exactly 9 characters, alphanumeric only
  return /^[a-zA-Z0-9]{4}$/.test(shortCode)
}

/**
 * Check if a tiny URL has expired
 *
 * @param expiresAt - The expiration timestamp
 * @returns True if expired, false otherwise
 */
export function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt
}

export const docUrlTtlSecs = process.env.DOCUMENT_URL_TTL_SECS
  ? Number.parseInt(process.env.DOCUMENT_URL_TTL_SECS, 10)
  : 300

/**
 * Generate a QR code for a tiny URL with the MIK logo in the center
 *
 * @param url - The tiny URL to encode in the QR code
 * @param size - Size of the QR code in pixels (default: 400)
 * @returns Buffer containing the PNG image of the QR code
 */
export async function generateQRCodeWithLogo(url: string, size: number = 400): Promise<Buffer> {
  try {
    // Step 1: Generate QR code with high error correction
    const qrBuffer = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    })

    // Step 2: Load and resize the logo
    const logoPath = await resolveMikLogoPath()
    if (!logoPath) {
      logger.warn('MIK logo not found. Returning QR code without logo overlay.')
      return qrBuffer
    }

    const logoSize = Math.floor(size * 0.2) // 20% of QR size
    const padding = Math.floor(logoSize * 0.15)
    const innerLogoSize = logoSize - padding * 2

    // Resize logo and make sure it's fully opaque
    const logoBuffer = await sharp(logoPath)
      .resize(innerLogoSize, innerLogoSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer()

    // Step 3: Create a white rectangle exactly where the logo will go
    const whiteBlock = await sharp({
      create: {
        width: logoSize,
        height: logoSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer()

    // Step 4: Composite the white block first (clears QR pixels underneath)
    const qrCleared = await sharp(qrBuffer)
      .composite([
        {
          input: whiteBlock,
          top: Math.floor((size - logoSize) / 2),
          left: Math.floor((size - logoSize) / 2),
        },
      ])
      .png()
      .toBuffer()

    // Step 5: Composite the logo on top
    const qrWithLogo = await sharp(qrCleared)
      .composite([
        {
          input: logoBuffer,
          top: Math.floor((size - innerLogoSize) / 2),
          left: Math.floor((size - innerLogoSize) / 2),
        },
      ])
      .png()
      .toBuffer()

    return qrWithLogo
  } catch (err) {
    logger.error('Failed to generate QR code with logo:', err)
    throw err
  }
}
