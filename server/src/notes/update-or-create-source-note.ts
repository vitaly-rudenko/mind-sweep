import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import type { Note } from './types.js'

export async function updateOrCreateSourceNote(
  input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery?: VendorEntityQuery
    note: Note
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<void> {
  const { userId, sourceBucketId, mirrorVendorEntityQuery, note } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error('Source bucket not found')

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.updateOrCreateNote({
      userId,
      bucketId: sourceBucket.id,
      mirrorVendorEntityQuery,
      note,
    })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
