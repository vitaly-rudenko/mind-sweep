import { match } from '../templates/match.js'
import { registry, type Deps } from '../registry.js'
import { storeNote } from './store-note.js'
import type { BucketQuery } from '../buckets/types.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import type { Note } from './types.js'

export async function handleNote(
  payload: {
    note: Note
    userId: number
    mirrorBucketQuery: BucketQuery
    mirrorVendorEntityQuery?: VendorEntityQuery
  },
  { storage }: Deps<'storage'> = registry.export()
) {
  const { note, userId, mirrorBucketQuery, mirrorVendorEntityQuery } = payload

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new Error('Bucket not found')

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)
  const matchingLink = links.find(link => !link.template || match(note.content, link.template) !== undefined)
  if (!matchingLink) return

  if (matchingLink.defaultTags) {
    note.tags.push(...matchingLink.defaultTags)
  }

  await storeNote({
    note,
    userId,
    mirrorVendorEntityQuery,
    sourceBucketId: matchingLink.sourceBucketId,
  })
}

