import { NotFoundError, UnsupportedActionError } from '../errors.js'
import { type Deps, registry } from '../registry.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'

export async function detachSourceNote(
  input: {
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<void> {
  const { userId, sourceBucketId, mirrorVendorEntityQuery } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new NotFoundError('SourceBucket not found', { sourceBucketId })

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.detachSourceNote({
      userId,
      sourceBucketId,
      mirrorVendorEntityQuery,
    })
  } else {
    throw new UnsupportedActionError('Unsupported SourceBucketType', { sourceBucketType: sourceBucket.bucketType })
  }
}
