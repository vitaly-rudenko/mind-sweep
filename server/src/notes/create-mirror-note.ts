import { type Deps, registry } from '../registry.js'
import type { MirrorNote, Note } from './types.js'
import { createTelegramVendorEntity } from '../telegram/create-telegram-vendor-entity.js'
import { NotFoundError, UnsupportedActionError } from '../errors.js'

export async function createMirrorNote(
  input: { userId: number, mirrorBucketId: number, note: Note },
  { storage }: Deps<'storage'> = registry.export()
): Promise<MirrorNote> {
  const { userId, mirrorBucketId, note } = input

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketId })

  // TODO: check if Note belongs to the Bucket?

  if (mirrorBucket.bucketType === 'telegram_chat') {
    return telegramBucketCreateMirrorNote({ userId, mirrorBucketId, note })
  } else {
    throw new UnsupportedActionError('Unsupported MirrorBucketType', { mirrorBucketType: mirrorBucket.bucketType })
  }
}

async function telegramBucketCreateMirrorNote(
  input: { userId: number; note: Note; mirrorBucketId: number },
  { storage, telegram }: Deps<'storage' | 'telegram'> = registry.export()
): Promise<MirrorNote> {
  const { userId, mirrorBucketId, note } = input

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketId })
  if (mirrorBucket.bucketType !== 'telegram_chat') throw new UnsupportedActionError('Unsupported MirrorBucketType', { mirrorBucketType: mirrorBucket.bucketType })

  const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)

  return {
    ...note,
    mirrorVendorEntity: createTelegramVendorEntity(message),
  }
}
