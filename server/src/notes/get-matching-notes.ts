import { registry, type Deps } from '../registry.js'
import { match } from '../templates/match.js'
import type { Note } from './types.js'

export async function getMatchingNotes(input: {
  userId: number
  sourceBucketId: number
  template?: string
}, { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()): Promise<Note[]> {
  const { userId, sourceBucketId, template } = input

  const bucket = await storage.getBucketById(userId, sourceBucketId)
  if (!bucket) throw new Error(`Bucket not found: ${sourceBucketId}`)

  const integration = await storage.getIntegrationById(userId, bucket.integrationId)
  if (!integration) throw new Error(`Integration not found: ${bucket.integrationId}`)

  let notes: Note[]
  if (bucket.bucketType === 'notion_database' && integration.integrationType === 'notion') {
    notes = await notionBucket.read({ bucket, integration })
  } else {
    throw new Error('Unsupported source bucket type')
  }

  return notes.filter(note => !template || match(note.content, template))
}
