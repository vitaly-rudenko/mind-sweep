import { TelegramError } from 'telegraf'
import type { Message } from 'telegraf/types'
import { logger } from '../logging/logger.js'
import { type Deps, registry } from '../registry.js'
import type { Note } from '../notes/types.js'
import type { VendorEntity } from './types.js'
import { createTelegramVendorEntity } from '../telegram/create-telegram-vendor-entity.js'
import { createVendorEntityHash } from './create-vendor-entity-hash.js'

export async function updateMirrorVendorEntity(input: { note: Note }, { telegram }: Deps<'telegram'>= registry.export()): Promise<VendorEntity> {
  logger.info({ input }, 'Updating mirror vendor entity')

  const { note } = input

  if (!note.mirrorVendorEntity) throw new Error('Note has no source vendor entity')

  if (note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
    try {
      let message: Message.TextMessage | true = await telegram.editMessageText(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId, undefined, note.content)
      if (message !== true) {
        return createTelegramVendorEntity(message)
      }
    } catch (err) {
      if (err instanceof TelegramError && err.response.description === 'Bad Request: message can\'t be edited') {
        const message = await telegram.sendMessage(note.mirrorVendorEntity.metadata.chatId, note.content)

        await telegram.deleteMessage(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId)

        return createTelegramVendorEntity(message)
      } else if (err instanceof TelegramError && err.response.description === 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message') {
        // ok
      } else {
        throw err
      }
    }

    return {
      ...note.mirrorVendorEntity,
      hash: createVendorEntityHash(note.content),
    }
  } else {
    throw new Error('Unsupported vendor entity type')
  }
}
