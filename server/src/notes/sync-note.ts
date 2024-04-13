import { logger } from '../logging/logger.js'
import { type Deps, registry } from '../registry.js'
import type { Link } from '../links/types.js'
import { storeNote } from './store-note.js'
import type { Note } from './types.js'
import { createVendorEntityHash } from '../vendor-entities/create-vendor-entity-hash.js'
import { createMirrorVendorEntity } from '../vendor-entities/create-mirror-vendor-entity.js'
import { updateMirrorVendorEntity } from '../vendor-entities/update-mirror-vendor-entity.js'

export async function syncNote(payload: {
  note: Note
  link: Link
  userId: number
}, { storage }: Deps<'storage'> = registry.export()) {
  logger.info({ payload }, 'Agnostic sync note')

  const { note, link, userId } = payload

  const mirrorBucket = await storage.getBucketById(userId, link.mirrorBucketId)
  if (!mirrorBucket) throw new Error(`Bucket not found: ${link.mirrorBucketId}`)

  if (note.mirrorVendorEntity) {
    if (note.mirrorVendorEntity.hash !== createVendorEntityHash(note.content)) {
      const mirrorVendorEntity = await updateMirrorVendorEntity({ note })

      await storeNote({
        note: { ...note, mirrorVendorEntity },
        sourceBucketId: link.sourceBucketId,
        userId,
      })
    }
  } else {
    const mirrorVendorEntity = await createMirrorVendorEntity({ note, mirrorBucket })

    await storeNote({
      note: { ...note, mirrorVendorEntity },
      sourceBucketId: link.sourceBucketId,
      userId,
    })
  }
}
