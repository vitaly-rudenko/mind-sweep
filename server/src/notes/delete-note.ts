import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'

export async function deleteNote(
  input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<void> {
  const { userId, sourceBucketId, mirrorVendorEntityQuery } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error(`Source bucket with ID ${sourceBucketId} not found`)

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.deleteNote({ userId, bucketId: sourceBucketId, mirrorVendorEntityQuery })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
