import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'

export async function detachNote(
  input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<void> {
  const { userId, sourceBucketId, mirrorVendorEntityQuery } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error('Source bucket not found')

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.detachNote({
      userId,
      bucketId: sourceBucket.id,
      mirrorVendorEntityQuery,
    })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
