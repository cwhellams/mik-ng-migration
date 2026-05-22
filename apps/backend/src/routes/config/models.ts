import { z } from 'zod'

export const AppConfigSchema = z.object({
  medicalCheckEnabled: z.boolean(),
})

export type AppConfig = z.infer<typeof AppConfigSchema>
