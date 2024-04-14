import type { Message } from 'telegraf/types'
import { logger } from '../logging/logger.js'
import { registry, type Deps } from '../registry.js'

export async function reactToAcknowledgeMessage(message: Message.TextMessage, { telegram }: Deps<'telegram'> = registry.export()) {
  try {
    await telegram.setMessageReaction(message.chat.id, message.message_id, [{ type: 'emoji', emoji: '👀' }])
  } catch (err) {
    logger.warn({ err }, 'Could not react to message')
  }

  setTimeout(async () => {
    try {
      telegram.setMessageReaction(message.chat.id, message.message_id, [])
    } catch (err) {
      logger.warn({ err }, 'Could remove reactions from message')
    }
  }, 2000)
}
