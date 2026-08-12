import { z } from 'zod'

// https://www.rfc-editor.org/rfc/rfc9457.html
export const ProblemSchema = z.object({
  // The HTTP status code
  status: z.number(),

  // A URI reference that identifies the problem type
  type: z.string().optional(),

  // A short, human-readable summary of the problem type.
  title: z.string().optional(),

  // A human-readable explanation
  // If present, ought to focus on helping the client correct the problem,
  // rather than giving debugging information.
  detail: z.string().optional(),

  // A URI reference that identifies the specific occurrence of the problem
  instance: z.string().optional(),

  // A timestamp indicating when the problem was generated
  timestamp: z.string().datetime().optional(),

  extensions: z.record(z.string(), z.unknown()).optional(),
})

export type Problem = z.infer<typeof ProblemSchema>
