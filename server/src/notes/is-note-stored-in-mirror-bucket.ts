import type { Bucket } from '../buckets/types.js'
import type { Note } from './types.js'

export function isNoteStoredInMirrorBucket(note: Note, bucket: Bucket): boolean {
  if (!note.mirrorVendorEntity) {
    throw new Error('Note does not have a mirror vendor entity')
  }

  if (bucket.bucketType === 'telegram_chat') {
    if (note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
      return note.mirrorVendorEntity.metadata.chatId === bucket.metadata.chatId
    }
  }

  return false
}
