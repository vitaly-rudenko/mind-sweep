import type { BucketQuery } from '../buckets/types.js'
import { NotFoundError } from '../errors.js'
import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import { deleteSourceNote } from './delete-source-note.js'

export async function handleMirrorNoteDeleted(
  input: {
    userId: number
    mirrorBucketQuery: BucketQuery
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage }: Deps<'storage'> = registry.export()
): Promise<void> {
  const { userId, mirrorBucketQuery, mirrorVendorEntityQuery } = input

  const mirrorBucket = await storage.queryBucket(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketQuery })

  const sourceBuckets = await storage.getLinkedSourceBuckets(userId, mirrorBucket.id)
  for (const sourceBucket of sourceBuckets) {
    await deleteSourceNote({
      userId,
      sourceBucketId: sourceBucket.id,
      mirrorVendorEntityQuery,
    })
  }
}