import { type Deps, registry } from '../registry.js'
import type { Note } from './types.js'

export async function updateOrCreateNote(
  input: {
    userId: number
    sourceBucketId: number
    note: Note
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<void> {
  const { userId, sourceBucketId, note } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new Error('Source bucket not found')

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.updateOrCreateNote({
      userId,
      bucketId: sourceBucket.id,
      note,
    })
  } else {
    throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
  }
}
