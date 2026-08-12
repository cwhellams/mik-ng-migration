import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'

import type { TimeResponse } from '@mik/contracts/time'

export const router = Router()

// Public endpoint — no auth required. Returns server wall-clock time so clients
// can detect and compensate for local clock skew. The server runs NTP-sync'd
// (Digital Ocean), so this timestamp is authoritative.
router.get('/', (_req: Request, res: Response<TimeResponse>) => {
  const now = new Date()
  res.status(HttpStatusCode.Ok).json({
    utcIso: now.toISOString(),
    epochMs: now.getTime(),
  })
})
