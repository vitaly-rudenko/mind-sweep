import { type Deps, registry } from '../registry.js'
import { isMatching } from '../templates/match.js'
import { deleteMirrorNote } from './delete-mirror-note.js'
import { detachSourceNote } from './detach-source-note.js'
import { isNoteStoredInMirrorBucket } from './is-note-stored-in-mirror-bucket.js'
import { readSourceNotes } from './read-source-notes.js'
import { updateOrCreateMirrorNote } from './update-or-create-mirror-note.js'
import { updateOrCreateSourceNote } from './update-or-create-source-note.js'

export async function syncSourceNotes(
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
      const matchingLinks = links.filter(link => !link.template || isMatching({ content: note.content, template: link.template }))
      const stopOnMatchIndex = matchingLinks.findIndex(link => link.settings.stopOnMatch)
      const matchingLinksBeforeStopped = stopOnMatchIndex === -1 ? matchingLinks : matchingLinks.slice(0, stopOnMatchIndex + 1)
      const matchingLinkBeforeStoppedForSourceBucket = matchingLinksBeforeStopped.find(link => link.sourceBucketId === sourceBucketId)

      if (matchingLinkBeforeStoppedForSourceBucket) {
        let noteToUpdate = note

        if (note.mirrorVendorEntity && !isNoteStoredInMirrorBucket(note, mirrorBucket)) {
          await deleteMirrorNote({ note })

          noteToUpdate = {
            ...note,
            mirrorVendorEntity: undefined,
          }
        }

        const mirrorNote = await updateOrCreateMirrorNote({
          userId,
          mirrorBucketId,
          note: noteToUpdate,
        })

        await updateOrCreateSourceNote({
          userId,
          sourceBucketId,
          note: mirrorNote,
        })
      } else if (note.mirrorVendorEntity && isNoteStoredInMirrorBucket(note, mirrorBucket)) {
        await detachSourceNote({
          userId,
          sourceBucketId,
          mirrorVendorEntityQuery: note.mirrorVendorEntity,
        })
      }
    }
  }
}

