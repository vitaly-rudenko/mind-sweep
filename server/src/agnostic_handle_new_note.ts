import { match } from './match.js'
import { registry, type Deps } from './registry.js'
import type { Note } from './types.js'

// Agnostic function
export async function agnosticHandleNewNote(
  payload: { note: Note; userId: number; mirrorBucketId: number },
  { storage }: Deps<'storage'> = registry.export()
) {
  const { note, userId, mirrorBucketId } = payload

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucketId)
  for (const link of links) {
    if (link.template && match(note.content, link.template) === undefined) continue

    if (link.defaultTags) {
      note.tags.push(...link.defaultTags)
    }

    await createNote({ note, userId, sourceBucketId: link.sourceBucketId })
  }
}

// Vendor selector function
async function createNote(
  payload: { note: Note; userId: number; sourceBucketId: number },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
) {
  const { note, userId, sourceBucketId } = payload

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error(`Bucket with ID ${sourceBucketId} not found`)

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.createNote({
      note,
      userId,
      bucketId: sourceBucket.id,
    })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
