import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  locale: z.string().optional(),
})

export type User = z.infer<typeof userSchema>
