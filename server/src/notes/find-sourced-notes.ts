import type { Bucket, BucketQuery } from '../buckets/types.js'
import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import type { Note } from './types.js'

export type SourcedNote = {
  sourceBucket: Bucket
  note: Note
}

export async function findSourcedNotes(
  input: {
    userId: number
    mirrorBucketQuery: BucketQuery
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<SourcedNote[]> {
  const { userId, mirrorBucketQuery, mirrorVendorEntityQuery } = input

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new Error('Bucket not found')

  const sourceBuckets = await storage.getLinkedSourceBuckets(userId, mirrorBucket.id)
  const sourcedNotes: SourcedNote[] = []

  for (const sourceBucket of sourceBuckets) {
    if (sourceBucket.bucketType === 'notion_database') {
      const note = await notionBucket.findNote({
        bucket: sourceBucket,
        mirrorVendorEntityQuery,
      })

      if (note) sourcedNotes.push({ sourceBucket, note })
    } else {
      throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
    }
  }

  return sourcedNotes
}