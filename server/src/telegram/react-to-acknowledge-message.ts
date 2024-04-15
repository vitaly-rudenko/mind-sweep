import { env } from '../env.js'
import { logger } from '../logging/logger.js'
import { registry, type Deps } from '../registry.js'

export async function reactToAcknowledgeMessage(chatId: number, messageId: number, { telegram }: Deps<'telegram'> = registry.export()) {
  try {
    await telegram.setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji: env.USE_TEST_MODE ? '🤩' : '👀' }])
  } catch (err) {
    logger.warn({ err }, 'Could not react to message')
  }

  setTimeout(async () => {
    try {
      telegram.setMessageReaction(chatId, messageId, [])
    } catch (err) {
      logger.warn({ err }, 'Could remove reactions from message')
    }
  }, 2000)
}
