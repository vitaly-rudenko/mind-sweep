import { z } from 'zod'

const _ = z
  .union([z.string(), z.array(z.string()).nonempty()])
  .transform((value) => (Array.isArray(value) ? value.join('\n') : value))

export const localeFileSchema = z.object({
  groupChatOnly: _,
  privateChatOnly: _,
  unknownUser: _,
})
