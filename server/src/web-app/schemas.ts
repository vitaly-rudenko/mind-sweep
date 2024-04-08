import { z } from 'zod'

export const authenticateWebAppSchema = z.object({ initData: z.string() })
export const initDataUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  username: z.string().optional(),
})
