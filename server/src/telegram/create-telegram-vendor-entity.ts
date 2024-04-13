import type { Message } from 'telegraf/types'
import type { VendorEntity } from '../vendor-entities/types.js'
import { createVendorEntityHash } from '../vendor-entities/create-vendor-entity-hash.js'

export function createTelegramVendorEntity(message: Message.TextMessage): VendorEntity {
  return {
    id: `${message.chat.id}_${message.message_id}`,
    hash: createVendorEntityHash(message.text),
    vendorEntityType: 'telegram_message',
    metadata: {
      chatId: message.chat.id,
      messageId: message.message_id,
    }
  }
}
