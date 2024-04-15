import type { BucketQuery } from '../buckets/types.js'
import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import type { Note } from './types.js'

export async function deleteNote(
  input: {
    userId: number
    mirrorBucketQuery: BucketQuery
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<Note | undefined> {
  const { userId, mirrorBucketQuery, mirrorVendorEntityQuery } = input

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new Error('Bucket not found')

  const sourceBuckets = await storage.getLinkedSourceBuckets(userId, mirrorBucket.id)
  for (const sourceBucket of sourceBuckets) {
    if (sourceBucket.bucketType === 'notion_database') {
      await notionBucket.deleteNote({
        bucket: sourceBucket,
        mirrorVendorEntityQuery,
      })
    } else {
      throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
    }
  }

  return undefined
}