import { type Deps, registry } from '../registry.js'
import type { Note } from './types.js'

export async function createSourceNote(
  input: {
    note: Note
    userId: number
    sourceBucketId: number
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<void> {
  const { note, userId, sourceBucketId } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error(`Source bucket with ID ${sourceBucketId} not found`)

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.createNote({ userId, bucketId: sourceBucket.id, note })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
