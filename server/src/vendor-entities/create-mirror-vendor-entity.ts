import { logger } from '../logging/logger.js'
import { type Deps, registry } from '../registry.js'
import type { Bucket } from '../buckets/types.js'
import type { Note } from '../notes/types.js'
import { createTelegramVendorEntity } from '../telegram/create-telegram-vendor-entity.js'
import type { VendorEntity } from './types.js'

export async function createMirrorVendorEntity(input: { note: Note; mirrorBucket: Bucket }, { telegram }: Deps<'telegram'>= registry.export()): Promise<VendorEntity> {
  logger.info({ input }, 'Creating mirror vendor entity')

  const { note, mirrorBucket } = input

  if (mirrorBucket.bucketType === 'telegram_chat') {
    const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)
    return createTelegramVendorEntity(message)
  } else {
    throw new Error('Unsupported mirror bucket type')
  }
}
