import type { BucketQuery } from '../buckets/types.js'
import { NotFoundError } from '../errors.js'
import { type Deps, registry } from '../registry.js'
import { isMatching } from '../templates/match.js'
import { createSourceNote } from './create-source-note.js'
import type { Note } from './types.js'

export async function handleMirrorNoteCreated(
  input: {
    userId: number
    note: Note
    mirrorBucketQuery: BucketQuery
  },
  { storage }: Deps<'storage'> = registry.export()
): Promise<void> {
  const { userId, note, mirrorBucketQuery } = input

  const mirrorBucket = await storage.queryBucket(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketQuery })

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)
  const processedSourceBucketIds = new Set<number>()

  for (const link of links) {
    if (processedSourceBucketIds.has(link.sourceBucketId)) continue
    if (link.template && !isMatching({ content: note.content, template: link.template })) continue

    await createSourceNote({
      userId,
      sourceBucketId: link.sourceBucketId,
      note: {
        content: note.content,
        tags: [...note.tags, ...link.defaultTags ?? []],
        mirrorVendorEntity: note.mirrorVendorEntity,
      },
    })

    processedSourceBucketIds.add(link.sourceBucketId)

    if (link.settings.stopOnMatch) break
  }
}
