import { NotFoundError, UnsupportedActionError } from '../errors.js'
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
  if (!sourceBucket) throw new NotFoundError('SourceBucket not found', { sourceBucketId })

  if (sourceBucket.bucketType === 'notion_database') {
    await notionBucket.createSourceNote({ userId, sourceBucketId, note })
  } else {
    throw new UnsupportedActionError('Unsupported SourceBucketType', { sourceBucketType: sourceBucket.bucketType })
  }
}
