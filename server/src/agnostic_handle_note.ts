import { match } from './match.js'
import { registry, type Deps } from './registry.js'
import type { BucketType, Note, VendorEntityQuery, VendorEntityType } from './types.js'

// Agnostic function
export async function agnosticStoreNote(
  payload: {
    note: Note
    userId: number
    mirrorBucketQuery: {
      id: string
      bucketType: BucketType
    }
    mirrorVendorEntityQuery?: VendorEntityQuery
  },
  { storage }: Deps<'storage'> = registry.export()
) {
  const { note, userId, mirrorBucketQuery, mirrorVendorEntityQuery } = payload

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery.bucketType, mirrorBucketQuery.id)
  if (!mirrorBucket) throw new Error(`Bucket with query ID ${mirrorBucketQuery.id} not found`)

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)
  for (const link of links) {
    if (link.template && match(note.content, link.template) === undefined) continue

    if (link.defaultTags) {
      note.tags.push(...link.defaultTags)
    }

    await storeNote({
      note,
      userId,
      mirrorVendorEntityQuery,
      sourceBucketId: link.sourceBucketId,
    })
  }
}

// Vendor selector function
export async function storeNote(
  payload: {
    note: Note
    userId: number
    sourceBucketId: number
    mirrorVendorEntityQuery?: {
      id: string
      vendorEntityType: VendorEntityType
    }
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
