import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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
    ACL: 'private',
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
      getAircraftBucketName: mockGetAircraftBucketName,
    }
  : {
      uploadFile,
      deleteFile,
      getPresignedUrl,
      getAircraftBucketName,
    }

export type { UploadResult }
