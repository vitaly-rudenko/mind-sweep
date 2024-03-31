import type { TelegramMessageVendorEntity, VendorEntityQuery } from '../types.js'
import { createVendorEntityHash } from '../vendor-entity.js'

export function createTelegramMessageVendorEntity(message: {
  text: string
  message_id: number
  chat: { id: number }
  from?: { id: number }
}): TelegramMessageVendorEntity {
  if (!message.from) {
    throw new Error('Invalid vendor entity: message.from is missing')
  }

  return {
    type: 'telegram_message',
    id: createTelegramMessageVendorEntityId(message),
    hash: createVendorEntityHash(message.text),
    metadata: {
      chatId: message.chat.id,
      messageId: message.message_id,
      fromUserId: message.from.id,
    }
  }
}

export function createTelegramMessageVendorEntityQuery(message: {
  chat: { id: number }
  message_id: number
}): VendorEntityQuery {
  return {
    type: 'telegram_message',
    id: createTelegramMessageVendorEntityId(message)
  }
}

export function createTelegramMessageVendorEntityId(message: { chat: { id: number }; message_id: number }): string {
  return `${message.chat.id}_${message.message_id}`
}
