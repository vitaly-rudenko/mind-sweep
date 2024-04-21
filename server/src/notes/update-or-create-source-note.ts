import { NotFoundError, UnsupportedActionError } from '../errors.js'
import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import type { Note, SourceNote } from './types.js'

export async function updateOrCreateSourceNote(
  input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery?: VendorEntityQuery
    note: Note
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<SourceNote> {
  const { userId, sourceBucketId, mirrorVendorEntityQuery, note } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new NotFoundError('SourceBucket not found', { sourceBucketId })

  if (sourceBucket.bucketType === 'notion_database') {
    return notionBucket.updateOrCreateSourceNote({
      userId,
      bucketId: sourceBucket.id,
      mirrorVendorEntityQuery,
      note,
    })
  } else {
    throw new UnsupportedActionError('Unsupported SourceBucketType', { sourceBucketType: sourceBucket.bucketType })
  }
}
