import type { BucketQuery } from '../buckets/types.js'
import { type Deps, registry } from '../registry.js'
import { match } from '../templates/match.js'
import type { Note } from './types.js'

export async function handleMirrorNoteCreated(
  input: {
    userId: number
    note: Note
    mirrorBucketQuery: BucketQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
) {
  const { userId, note, mirrorBucketQuery } = input

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new Error('Mirror bucket not found')

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)
  const link = links.find(link => !link.template || match({ content: note.content, template: link.template }) !== undefined)
  if (!link) return

  const sourceBucket = await storage.getBucketById(userId, link.sourceBucketId)
  if (!sourceBucket) throw new Error(`Source bucket with ID ${link.sourceBucketId} not found`)

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.createNote({
      userId,
      bucketId: sourceBucket.id,
      note: {
        ...note,
        tags: [...note.tags, ...link?.defaultTags ?? []],
      },
    })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}