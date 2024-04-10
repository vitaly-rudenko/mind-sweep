import { registry, type Deps } from '../registry.js'
import type { Note, Link, Bucket, VendorEntity } from '../types.js'
import { createTelegramVendorEntity } from '../utils.js'

export async function agnosticSyncNote(payload: {
  note: Note
  link: Link
  userId: number
}, { storage }: Deps<'storage'> = registry.export()) {
  const { note, link, userId } = payload

  const mirrorBucket = await storage.getBucketById(userId, link.mirrorBucketId)
  if (!mirrorBucket) throw new Error(`Bucket not found: ${link.mirrorBucketId}`)

  if (!note.vendorEntity) {
    const vendorEntity = await createVendorEntity({ note, mirrorBucket })

    await updateNote({
      note: { ...note, vendorEntity },
      sourceBucketId: link.sourceBucketId,
      userId,
    })
  }

  // TODO: sync
}

// Partly agnostic function
async function updateNote(payload: { note: Note; sourceBucketId: number; userId: number }, { notionBucket }: Deps<'notionBucket'> = registry.export()) {
  const { note, sourceBucketId, userId } = payload

  if (note.noteType === 'notion_page') {
    await notionBucket.updateNote({ note, bucketId: sourceBucketId, userId })
  } else {
    throw new Error('Unsupported note type')
  }
}

// Partly agnostic function
async function createVendorEntity(input: { note: Note; mirrorBucket: Bucket }, { telegram }: Deps<'telegram'>= registry.export()): Promise<VendorEntity> {
  const { note, mirrorBucket } = input

  if (mirrorBucket.bucketType === 'telegram_chat') {
    const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)
    return createTelegramVendorEntity(message)
  } else {
    throw new Error('Unsupported mirror bucket type')
  }
}

