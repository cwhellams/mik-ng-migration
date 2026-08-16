import { Router } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { getOutboxItems, resetOutboxItemToPending } from '../../db/outbox-simplbooks-queries.ts'
import {
  OutboxFiltersSchema,
  type OutboxItem,
  type OutboxListResponse,
} from '@mik/contracts/outbox'
import { problem } from '../response.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.OUTBOX_ADMIN))

function toOutboxItemDto(row: Awaited<ReturnType<typeof getOutboxItems>>[number]): OutboxItem {
  return {
    id: row.id,
    event_type: row.eventType,
    status: row.status as OutboxItem['status'],
    payload: row.payload,
    created_at_utc: new Date(row.createdAtUtc).toISOString(),
    updated_at_utc: new Date(row.updatedAtUtc).toISOString(),
    processed_at: row.processedAt != null ? new Date(row.processedAt).toISOString() : null,
    error_message: row.errorMessage ?? null,
  }
}

router.get('/', async (req, res: import('express').Response<OutboxListResponse>) => {
  const filters = OutboxFiltersSchema.parse(req.query)
  const items = await getOutboxItems(filters)
  res.status(200).json({ items: items.map(toOutboxItemDto) })
})

router.patch('/:id/retry', async (req, res) => {
  const { id } = req.params
  if (!id) {
    return problem({ status: 400, detail: 'Missing id' })
  }
  await resetOutboxItemToPending(id)
  res.status(200).json({ message: 'Message queued for reprocessing' })
})
