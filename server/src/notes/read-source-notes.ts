import { NotFoundError, UnsupportedActionError } from '../errors.js';
import { type Deps, registry } from '../registry.js'
import type { SourceNote } from './types.js';

export async function readSourceNotes(
  input: { userId: number; sourceBucketId: number },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<SourceNote[]> {
  const { userId, sourceBucketId } = input

  const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
  if (!sourceBucket) throw new NotFoundError('SourceBucket not found', { sourceBucketId })

  if (sourceBucket.bucketType === 'notion_database') {
    return notionBucket.readSourceNotes({ userId, sourceBucketId })
  } else {
    throw new UnsupportedActionError('Unsupported SourceBucketType', { sourceBucketType: sourceBucket.bucketType })
  }
}