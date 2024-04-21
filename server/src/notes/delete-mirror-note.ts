import { TelegramError } from 'telegraf'
import { type Deps, registry } from '../registry.js'
import type { VendorEntity } from '../vendor-entities/types.js'
import { UnsupportedActionError } from '../errors.js'

export async function deleteMirrorNote(
  input: {
    mirrorVendorEntity: VendorEntity
  },
  { telegram }: Deps<'storage' | 'telegram'> = registry.export()
): Promise<void> {
  const { mirrorVendorEntity } = input

  if (mirrorVendorEntity.vendorEntityType === 'telegram_message') {
    try {
      await telegram.deleteMessage(mirrorVendorEntity.metadata.chatId, mirrorVendorEntity.metadata.messageId)
    } catch (err) {
      if (err instanceof TelegramError && err.response.description === 'Bad Request: message can\'t be deleted for everyone') {
        await telegram.setMessageReaction(mirrorVendorEntity.metadata.chatId, mirrorVendorEntity.metadata.messageId, [{ type: 'emoji', emoji: '💩' }])
      } else if (err instanceof TelegramError && err.response.description === 'Bad Request: message to delete not found') {
        // ok
      } else {
        throw err
      }
    }
  } else {
    throw new UnsupportedActionError('Unsupported MirrorVendorEntityType', { mirrorVendorEntityType: mirrorVendorEntity.vendorEntityType })
  }
}