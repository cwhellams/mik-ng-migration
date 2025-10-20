import type { Auditable } from '../../src/types/schema.ts'

export const maskAudit = (entity: Auditable) => ({
  ...entity,
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
})

export const audit = (
  updatedBy?: string | null,
  createdBy?: string | null,
): Partial<Auditable> => ({
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
  ...(createdBy && { createdBy }),
  ...(updatedBy && { updatedBy }),
  ...(createdBy == null && { createdBy: expect.any(String) }),
  ...(updatedBy == null && { updatedBy: expect.any(String) }),
})
