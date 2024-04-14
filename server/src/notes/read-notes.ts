import { type Deps, registry } from '../registry.js'
import type { Note } from './types.js'

export async function readNotes(
  input: { userId: number; bucketId: number },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
): Promise<Note[]> {
  const { userId, bucketId } = input

  const bucket = await storage.getBucketById(userId, bucketId)
  if (!bucket) throw new Error(`Bucket not found: ${bucketId}`)

  const integration = await storage.getIntegrationById(userId, bucket.integrationId)
  if (!integration) throw new Error(`Integration not found: ${bucket.integrationId}`)

  if (bucket.bucketType === 'notion_database' && integration.integrationType === 'notion') {
    return notionBucket.read({ bucket, integration })
  } else {
    throw new Error('Unsupported source bucket type')
  }
}