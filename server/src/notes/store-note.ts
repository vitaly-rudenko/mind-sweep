import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import type { Note } from './types.js'

export async function storeNote(
  payload: {
    note: Note
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery?: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
) {
  const { note, userId, sourceBucketId, mirrorVendorEntityQuery } = payload

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error(`Bucket with ID ${sourceBucketId} not found`)

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.storeNote({
      note,
      userId,
      bucketId: sourceBucket.id,
      mirrorVendorEntityQuery,
    })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
