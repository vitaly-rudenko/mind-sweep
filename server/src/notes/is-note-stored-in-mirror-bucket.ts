import type { Bucket } from '../buckets/types.js'
import { InvalidResourceError } from '../errors.js'
import type { Note } from './types.js'

export function isNoteStoredInMirrorBucket(note: Note, bucket: Bucket): boolean {
  if (!note.mirrorVendorEntity) {
    throw new InvalidResourceError('Note does not have MirrorVendorEntity')
  }

  if (bucket.bucketType === 'telegram_chat' && note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
    return note.mirrorVendorEntity.metadata.chatId === bucket.metadata.chatId
  }

  return false
}
