import { type Deps, registry } from '../registry.js'
import { isMatching } from '../templates/match.js'
import { deleteMirrorNote } from './delete-mirror-note.js'
import { detachSourceNote } from './detach-source-note.js'
import { doesNoteBelongToMirrorBucket } from './does-note-belong-to-mirror-bucket.js'
import { readSourceNotes } from './read-source-notes.js'
import { updateOrCreateMirrorNote } from './update-or-create-mirror-note.js'
import { updateOrCreateSourceNote } from './update-or-create-source-note.js'

export async function syncNotes(
  input: {
    userId: number
    mirrorBucketId: number
  },
  { storage }: Deps<'storage'> = registry.export()
): Promise<void> {
  const { userId, mirrorBucketId } = input

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new Error('Mirror bucket not found')

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)
  const sourceBucketIds = new Set(links.map(link => link.sourceBucketId))

  for (const sourceBucketId of sourceBucketIds) {
    const notes = await readSourceNotes({ userId, bucketId: sourceBucketId })

    for (const note of notes) {
      const link = links.find(link => !link.template || isMatching({ content: note.content, template: link.template }))

      if (link?.sourceBucketId === sourceBucketId) {
        if (note.mirrorVendorEntity && !doesNoteBelongToMirrorBucket(note, mirrorBucket)) {
          await deleteMirrorNote({
            userId,
            mirrorBucketId,
            note,
          })
        }

        const mirrorNote = await updateOrCreateMirrorNote({
          userId,
          mirrorBucketId,
          note,
        })

        await updateOrCreateSourceNote({
          userId,
          sourceBucketId,
          note: mirrorNote,
        })
      } else if (note.mirrorVendorEntity && doesNoteBelongToMirrorBucket(note, mirrorBucket)) {
        await detachSourceNote({
          userId,
          sourceBucketId,
          mirrorVendorEntityQuery: note.mirrorVendorEntity,
        })
      }
    }
  }
}

