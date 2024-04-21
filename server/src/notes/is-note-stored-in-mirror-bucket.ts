import type { Bucket } from '../buckets/types.js'
import type { MirrorNote } from './types.js'

export function isNoteStoredInMirrorBucket(note: MirrorNote, bucket: Bucket): boolean {
  if (bucket.bucketType === 'telegram_chat' && note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
    return note.mirrorVendorEntity.metadata.chatId === bucket.metadata.chatId
  }

  return false
}
