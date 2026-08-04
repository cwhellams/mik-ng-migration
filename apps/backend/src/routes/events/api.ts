import { Router } from 'express'
import type { Request, Response } from 'express'
import { HttpStatusCode } from 'axios'
import multer from 'multer'
import sharp from 'sharp'
import { nanoid } from 'nanoid'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  EventCreateSchema,
  EventListQuerySchema,
  EventUpdateSchema,
  type ClubEvent,
  type EventListResponse,
} from './models.ts'
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventImageKey,
  setEventImage,
  clearEventImage,
} from '../../db/events-queries.ts'
import { storageService } from '../../services/storage.ts'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

const EVENT_IMAGE_FOLDER = 'events'
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB — raw upload limit before compression
const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2 MB — post-compression limit

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG and WebP images are allowed'))
    }
  },
})

const buildEventImageUrl = (fileName: string): string => {
  const base =
    process.env.TINY_URL_BASE_URL ??
    process.env.PUBLIC_URL ??
    process.env.BACKEND_URL ??
    'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/api/v1/events/images/${fileName}`
}

async function processEventImage(file: Express.Multer.File): Promise<Buffer> {
  const buildImage = () =>
    sharp(file.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })

  let buffer = await buildImage().jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  if (buffer.length > MAX_IMAGE_BYTES) {
    buffer = await buildImage().jpeg({ quality: 70, mozjpeg: true }).toBuffer()
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Event image is too large after compression. Please upload a smaller image.',
    })
  }

  return buffer
}

const parseEventFilters = (query: Request['query']) => {
  const parsed = EventListQuerySchema.safeParse(query)
  if (!parsed.success) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid event filters',
      extensions: { errors: parsed.error.issues },
    })
  }

  return parsed.data
}

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoint – returns only events flagged as public (no auth required)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public', async (req: Request, res: Response<EventListResponse>) => {
  const { from, to } = parseEventFilters(req.query)
  const events = await getAllEvents({
    publicOnly: true,
    from,
    to,
  })
  return res.status(HttpStatusCode.Ok).json({ events })
})

// Matches exactly the file names we generate (`${nanoid()}.jpg`). Express
// decodes %2F inside a single route param into a literal '/', so a raw
// fileName could otherwise smuggle '../' segments into the storage key and
// reach other folders in the shared bucket (private receipts, qualification
// proofs, etc.) — reject anything that isn't our own generated shape up front.
const EVENT_IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.jpg$/

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoint – serves uploaded event images (no auth required), so both
// the public website and this app's own member UI can load them as plain
// <img> URLs. Cached forever: every upload gets a fresh random file name.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/images/:fileName', async (req: Request<{ fileName: string }>, res: Response) => {
  if (!EVENT_IMAGE_FILE_NAME_PATTERN.test(req.params.fileName)) {
    return problem({ status: 404, detail: 'Image not found' })
  }

  const key = `${EVENT_IMAGE_FOLDER}/${req.params.fileName}`
  try {
    const buffer = await storageService.downloadFile(key)
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(HttpStatusCode.Ok).send(buffer)
  } catch {
    return problem({ status: 404, detail: 'Image not found' })
  }
})

// All remaining routes require at least MEMBER permission
router.use(validateUser(MIKPermissions.MEMBER, MIKPermissions.EVENTS_ADMIN))

// ─────────────────────────────────────────────────────────────────────────────
// GET /  – list all events (members see all; filters via query params)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response<EventListResponse>) => {
  const { from, to } = parseEventFilters(req.query)
  const events = await getAllEvents({
    from,
    to,
  })
  return res.status(HttpStatusCode.Ok).json({ events })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /:eventId – single event
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:eventId', async (req: Request<{ eventId: string }>, res: Response<ClubEvent>) => {
  const event = await getEventById(req.params.eventId)
  if (!event) {
    return problem({ status: 404, detail: 'Event not found' })
  }
  return res.status(HttpStatusCode.Ok).json(event)
})

// ─────────────────────────────────────────────────────────────────────────────
// POST / – create event (EVENTS_ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  validateUser(MIKPermissions.EVENTS_ADMIN),
  async (req: Request, res: Response<ClubEvent>) => {
    const parsed = EventCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid event data',
        extensions: { errors: parsed.error.issues },
      })
    }

    try {
      const event = await createEvent(parsed.data, req.user!)
      logger.info(`Event created: ${event.eventId} by ${req.user!.memberId}`)
      return res.status(HttpStatusCode.Created).json(event)
    } catch (error) {
      logger.error(`Failed to create event: ${error}`)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to create event',
      })
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:eventId – update event (EVENTS_ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  '/:eventId',
  validateUser(MIKPermissions.EVENTS_ADMIN),
  async (req: Request<{ eventId: string }>, res: Response<ClubEvent>) => {
    const parsed = EventUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid event data',
        extensions: { errors: parsed.error.issues },
      })
    }

    try {
      const event = await updateEvent(req.params.eventId, parsed.data, req.user!)
      if (!event) {
        return problem({ status: 404, detail: 'Event not found' })
      }
      logger.info(`Event updated: ${event.eventId} by ${req.user!.memberId}`)
      return res.status(HttpStatusCode.Ok).json(event)
    } catch (error) {
      logger.error(`Failed to update event: ${error}`)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to update event',
      })
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:eventId – delete event (EVENTS_ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:eventId',
  validateUser(MIKPermissions.EVENTS_ADMIN),
  async (req: Request<{ eventId: string }>, res: Response) => {
    try {
      const imageKey = await getEventImageKey(req.params.eventId)
      const deleted = await deleteEvent(req.params.eventId)
      if (!deleted) {
        return problem({ status: 404, detail: 'Event not found' })
      }
      if (imageKey) {
        await storageService.deleteFile(imageKey).catch((err) => {
          logger.error(`Failed to delete event image ${imageKey}: ${err}`)
        })
      }
      logger.info(`Event deleted: ${req.params.eventId} by ${req.user!.memberId}`)
      return res.status(HttpStatusCode.NoContent).end()
    } catch (error) {
      logger.error(`Failed to delete event: ${error}`)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to delete event',
      })
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /:eventId/image – upload/replace the event image (EVENTS_ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:eventId/image',
  validateUser(MIKPermissions.EVENTS_ADMIN),
  imageUpload.single('file'),
  async (req: Request<{ eventId: string }>, res: Response<ClubEvent>) => {
    if (!req.file) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'No image uploaded' })
    }

    const existingImageKey = await getEventImageKey(req.params.eventId)
    if (existingImageKey === undefined) {
      return problem({ status: 404, detail: 'Event not found' })
    }

    const buffer = await processEventImage(req.file)
    const fileName = `${nanoid()}.jpg`
    const key = `${EVENT_IMAGE_FOLDER}/${fileName}`

    try {
      await storageService.uploadFile(buffer, fileName, 'image/jpeg', EVENT_IMAGE_FOLDER)
    } catch (error) {
      logger.error(`Failed to upload event image: ${error}`)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to upload image',
      })
    }

    if (existingImageKey) {
      await storageService.deleteFile(existingImageKey).catch((err) => {
        logger.error(`Failed to delete previous event image ${existingImageKey}: ${err}`)
      })
    }

    const event = await setEventImage(req.params.eventId, buildEventImageUrl(fileName), key)
    if (!event) {
      return problem({ status: 404, detail: 'Event not found' })
    }
    logger.info(`Event image uploaded: ${req.params.eventId} by ${req.user!.memberId}`)
    return res.status(HttpStatusCode.Ok).json(event)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:eventId/image – remove the event image (EVENTS_ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:eventId/image',
  validateUser(MIKPermissions.EVENTS_ADMIN),
  async (req: Request<{ eventId: string }>, res: Response<ClubEvent>) => {
    const imageKey = await getEventImageKey(req.params.eventId)
    if (imageKey === undefined) {
      return problem({ status: 404, detail: 'Event not found' })
    }

    if (imageKey) {
      await storageService.deleteFile(imageKey).catch((err) => {
        logger.error(`Failed to delete event image ${imageKey}: ${err}`)
      })
    }

    const event = await clearEventImage(req.params.eventId)
    if (!event) {
      return problem({ status: 404, detail: 'Event not found' })
    }
    logger.info(`Event image removed: ${req.params.eventId} by ${req.user!.memberId}`)
    return res.status(HttpStatusCode.Ok).json(event)
  },
)
