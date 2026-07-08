import { Router } from 'express'
import type { Request, Response } from 'express'
import { HttpStatusCode } from 'axios'

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
} from '../../db/events-queries.ts'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

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
      const deleted = await deleteEvent(req.params.eventId)
      if (!deleted) {
        return problem({ status: 404, detail: 'Event not found' })
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
