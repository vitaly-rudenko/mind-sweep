import { type Deps, registry } from '../registry.js'
import { doesNoteBelongToMirrorBucket } from './does-note-belong-to-mirror-bucket.js'
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

  if (!doesNoteBelongToMirrorBucket(note, mirrorBucket)) {
    throw new Error('Note does not belong to mirror bucket')
  }

  if (mirrorBucket.bucketType === 'telegram_chat') {
    if (note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
      // TODO: catch errors
      await telegram.deleteMessage(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId)
    } else {
      throw new Error('Unsupported vendor entity type for given bucket type')
    }
  } else {
    throw new Error(`Unsupported mirror bucket type: ${mirrorBucket.bucketType}`)
  }
}