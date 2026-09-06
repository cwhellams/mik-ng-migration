import { Hono } from 'hono'

import type { TimeResponse } from '@mik/contracts/time'

export const time = new Hono()

// Public endpoint — no auth required. Returns server wall-clock time so clients
// can detect and compensate for local clock skew.
//
// The comment this replaces said the timestamp is authoritative because the
// Digital Ocean host is NTP-synced. That reasoning changes rather than
// disappears: Cloudflare's clock is the edge's, and inside a Worker `Date.now()`
// advances only on I/O, so two reads with no await between them return the same
// value. Neither matters for this endpoint, which does one read and returns it.
time.get('/', (c) => {
  const now = new Date()
  return c.json<TimeResponse>({
    utcIso: now.toISOString(),
    epochMs: now.getTime(),
  })
})
