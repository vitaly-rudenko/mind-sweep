import type { BucketQuery } from '../buckets/types.js'
import { type Deps, registry } from '../registry.js'
import { match } from '../templates/match.js'
import type { VendorEntityQuery } from '../vendor-entities/types.js'
import { findSourcedNotes } from './find-sourced-notes.js'
import { handleMirrorNoteCreated } from './handle-mirror-note-created.js'
import type { Note } from './types.js'

export async function handleMirrorNoteUpdated(
  input: {
    userId: number
    note: Note
    mirrorBucketQuery: BucketQuery
    mirrorVendorEntityQuery: VendorEntityQuery
  },
  { storage, notionBucket }: Deps<'storage' | 'notionBucket'> = registry.export()
) {
  const { userId, note, mirrorBucketQuery, mirrorVendorEntityQuery } = input

  const mirrorBucket = await storage.getBucketByQueryId(userId, mirrorBucketQuery)
  if (!mirrorBucket) throw new Error('Mirror bucket not found')

  const sourcedNotes = await findSourcedNotes({
    userId,
    mirrorBucketQuery,
    mirrorVendorEntityQuery,
  })

  for (const sourcedNote of sourcedNotes) {
    const links = await storage.getLinksByBucketIds(userId, sourcedNote.sourceBucket.id, mirrorBucket.id)
    const link = links.find(link => !link.template || match(link.template, note.content))

    if (sourcedNote.sourceBucket.bucketType === 'notion_database') {
      await notionBucket.updateNote({
        userId,
        bucketId: sourcedNote.sourceBucket.id,
        note: {
          ...note,
          tags: [...note.tags, ...link?.defaultTags ?? []],
        },
      })
    } else {
      throw new Error(`Unsupported source bucket type: ${sourcedNote.sourceBucket.bucketType}`)
    }
  }

  if (sourcedNotes.length === 0) {
    await handleMirrorNoteCreated({
      userId,
      note,
      mirrorBucketQuery,
    })
  }
}