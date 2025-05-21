import { z, ZodObject } from 'zod'

// common audit fields
export const AuditableSchema = z
  .object({
    createdAt: z.string().datetime(),
    createdBy: z.string(),
    updatedAt: z.string().datetime(),
    updatedBy: z.string(),
  })
  .strict()

// object with auditable fields
export type Auditable = z.infer<typeof AuditableSchema>

// audit fields are not used from incoming requests
export type Upsert<T extends Auditable> = Partial<
  Pick<T, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>
> &
  Omit<T, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>

// audit fields are not used from incoming create or update requests
export const UpsertSchema = <T extends ZodObject<typeof AuditableSchema.shape>>(schema: T) =>
  schema.omit({
    createdAt: true,
    createdBy: true,
    updatedAt: true,
    updatedBy: true,
  }) as T

export const BooleanSchema = z
  .enum(['true', 'false'])
  .nullish()
  .transform(v => v === 'true')
