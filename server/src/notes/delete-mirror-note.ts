import { logger } from '../logging/logger.js'
import { type Deps, registry } from '../registry.js'
import { isNoteStoredInMirrorBucket } from './is-note-stored-in-mirror-bucket.js'
import type { Note } from './types.js'

export async function deleteMirrorNote(
  input: {
    userId: number
    mirrorBucketId: number
    note: Note
  },
  { storage, telegram }: Deps<'storage' | 'telegram'> = registry.export()
): Promise<void> {
  const { userId, mirrorBucketId, note } = input

  if (!note.mirrorVendorEntity) throw new Error('Note does not have a mirror vendor entity')

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new Error('Mirror bucket not found')

  if (!isNoteStoredInMirrorBucket(note, mirrorBucket)) {
    throw new Error('Note is not stored in this Mirror Bucket')
  }

  if (mirrorBucket.bucketType === 'telegram_chat') {
    if (note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
      try {
        await telegram.deleteMessage(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId)
      } catch (err) {
        logger.error({ err }, 'Could not delete message')
      }
    } else {
      throw new Error('Unsupported vendor entity type for given bucket type')
    }
  } else {
    throw new Error(`Unsupported mirror bucket type: ${mirrorBucket.bucketType}`)
  }
}