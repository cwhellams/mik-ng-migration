import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { nanoid } from 'nanoid'
import logger from '../lib/logger.ts'

interface UploadResult {
  key: string
  url: string
}

const MIK_MEMBER_PUBLIC_BUCKET = 'mik-member-public'

const accessKey = process.env.DIGITAL_OCEAN_SPACES_KEY
const secretKey = process.env.DIGITAL_OCEAN_SPACES_SECRET
const region = process.env.DIGITAL_OCEAN_SPACES_REGION || 'fra1'
const endpoint = process.env.DIGITAL_OCEAN_SPACES_ENDPOINT || 'https://fra1.digitaloceanspaces.com'

if (!accessKey || !secretKey) {
  throw new Error('Digital Ocean Spaces credentials not configured')
}

const s3Client = new S3Client({
  forcePathStyle: false,
  endpoint,
  region,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  },
  // AWS SDK v3 ≥ 3.758 defaults requestChecksumCalculation to 'WHEN_SUPPORTED',
  // which adds x-amz-checksum-* headers that Digital Ocean Spaces does not
  // include in its V4 signature verification, causing SignatureDoesNotMatch.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

export async function uploadFile(
  file: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'documents',
  bucketName?: string,
): Promise<UploadResult> {
  //const extension = originalName.split('.').pop() || ''
  const key = `${folder}/${originalName}`
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file,
    ContentType: mimeType,
    // ACL is intentionally omitted: new DO Spaces buckets disable per-object ACLs by default
    // (changed April 2024). Including x-amz-acl on an ACL-disabled bucket causes
    // SignatureDoesNotMatch because the server excludes that header when computing its
    // own signature. Privacy is enforced at bucket level (Space set to "Restricted").
  })
  await s3Client.send(command)
  const url = `${endpoint}/${bucket}/${key}`
  return { key, url }
}

export async function deleteFile(key: string, bucketName?: string): Promise<void> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  logger.info(`Deleting file with key: ${key} from bucket: ${bucket}`)
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  })
  await s3Client.send(command)
}

export async function getPresignedUrl(
  key: string,
  expiresIn: number = 3600,
  bucketName?: string,
): Promise<string> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })
  return await getSignedUrl(s3Client, command, { expiresIn })
}

export async function downloadFile(key: string, bucketName?: string): Promise<Buffer> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  const response = await s3Client.send(command)
  if (!response.Body) throw new Error(`No body in GetObject response for key ${key}`)
  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function copyFile(
  sourceKey: string,
  destKey: string,
  bucketName?: string,
): Promise<void> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  const command = new CopyObjectCommand({
    Bucket: bucket,
    Key: destKey,
    CopySource: `${bucket}/${encodeURIComponent(sourceKey)}`,
  })
  await s3Client.send(command)
}

export function getAircraftBucketName(registration: string): string {
  const suffix = registration.slice(-3).toLowerCase()
  return `mik-ac-${suffix}`
}

// Mock service for testing

// Mock static functions for testing
export async function mockUploadFile(
  file: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'documents',
  bucketName?: string,
): Promise<UploadResult> {
  const extension = originalName.split('.').pop() || ''
  const key = `${folder}/${nanoid()}.${extension}`
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  const url = `https://mock-spaces.com/${bucket}/${key}`
  return { key, url }
}

export async function mockDeleteFile(key: string, bucketName?: string): Promise<void> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  console.log(`Mock: Would delete file with key: ${key} from bucket: ${bucket}`)
}

export async function mockGetPresignedUrl(
  key: string,
  expiresIn: number = 3600,
  bucketName?: string,
): Promise<string> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  return `https://mock-spaces.com/${bucket}/${key}?expires=${Date.now() + expiresIn * 1000}`
}

export async function mockDownloadFile(_key: string, _bucketName?: string): Promise<Buffer> {
  return Buffer.from('mock-file-contents')
}

export async function mockCopyFile(
  sourceKey: string,
  destKey: string,
  bucketName?: string,
): Promise<void> {
  const bucket = bucketName || MIK_MEMBER_PUBLIC_BUCKET
  console.log(
    `Mock: Would copy file from key: ${sourceKey} to key: ${destKey} in bucket: ${bucket}`,
  )
}

export function mockGetAircraftBucketName(registration: string): string {
  const suffix = registration.slice(-3).toLowerCase()
  return `mik-ac-${suffix}`
}

// Export the appropriate service based on environment

// Export static functions based on environment
const isTest = process.env.NODE_ENV === 'test'

export const storageService = isTest
  ? {
      uploadFile: mockUploadFile,
      deleteFile: mockDeleteFile,
      getPresignedUrl: mockGetPresignedUrl,
      downloadFile: mockDownloadFile,
      copyFile: mockCopyFile,
      getAircraftBucketName: mockGetAircraftBucketName,
    }
  : {
      uploadFile,
      deleteFile,
      getPresignedUrl,
      downloadFile,
      copyFile,
      getAircraftBucketName,
    }

export type { UploadResult }
