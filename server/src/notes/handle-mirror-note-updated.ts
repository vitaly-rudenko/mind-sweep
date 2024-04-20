import type { BucketQuery } from '../buckets/types.js'
import { type Deps, registry } from '../registry.js'
import { isMatching } from '../templates/match.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import { detachSourceNote } from './detach-source-note.js'
import type { Note } from './types.js'
import { updateOrCreateSourceNote } from './update-or-create-source-note.js'

export async function handleMirrorNoteUpdated(
  input: {
    userId: number
    note: Note
    mirrorBucketQuery: BucketQuery
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage }: Deps<'storage'> = registry.export()
): Promise<void> {
  const { userId, note, mirrorBucketQuery, mirrorVendorEntityQuery } = input

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new Error('Mirror bucket not found')

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)

  const processedSourceBucketIds = new Set<number>()
  for (const link of links) {
    if (processedSourceBucketIds.has(link.sourceBucketId)) continue
    if (link.template && !isMatching({ content: note.content, template: link.template })) continue

    await updateOrCreateSourceNote({
      userId,
      sourceBucketId: link.sourceBucketId,
      mirrorVendorEntityQuery,
      note: {
        content: note.content,
        tags: [...note.tags, ...link.defaultTags ?? []],
        mirrorVendorEntity: note.mirrorVendorEntity,
      },
    })

    processedSourceBucketIds.add(link.sourceBucketId)

    if (link.settings.stopOnMatch) break
  }

  const unprocessedSourceBucketIds = links.map(link => link.sourceBucketId).filter(id => !processedSourceBucketIds.has(id))
  for (const sourceBucketId of unprocessedSourceBucketIds) {
    await detachSourceNote({
      userId,
      sourceBucketId,
      mirrorVendorEntityQuery,
    })
  }
}
