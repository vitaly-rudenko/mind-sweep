import { logger } from '../logging/logger.js'
import { type Deps, registry } from '../registry.js'
import type { Note } from './types.js'

export async function deleteMirrorNote(
  input: {
    note: Note
  },
  { storage, telegram }: Deps<'storage' | 'telegram'> = registry.export()
): Promise<void> {
  const { note } = input

  if (!note.mirrorVendorEntity) throw new Error('Note does not have a mirror vendor entity')

  if (note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
    try {
      await telegram.deleteMessage(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId)
    } catch (err) {
      logger.error({ err }, 'Could not delete message')
    }
  } else {
    throw new Error('Unsupported vendor entity type for given bucket type')
  }
}