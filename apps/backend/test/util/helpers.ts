import type { Auditable } from '../../src/types/schema.ts'

export const maskAudit = (entity: Auditable) => ({
  ...entity,
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
})

export const audit = (createdBy?: string, updatedBy?: string): Auditable => ({
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
  createdBy: createdBy ?? expect.any(String),
  updatedBy: updatedBy ?? createdBy ?? expect.any(String),
})
