import { NotFoundError } from '../errors.js'
import type { Link } from '../links/types.js'
import { type Deps, registry } from '../registry.js'
import { isMatching } from '../templates/match.js'
import { VendorEntityQuery } from '../vendor-entities/types.js'
import { createMirrorNote } from './create-mirror-note.js'
import { deleteMirrorNote } from './delete-mirror-note.js'
import { detachSourceNote } from './detach-source-note.js'
import { isNoteStoredInMirrorBucket } from './is-note-stored-in-mirror-bucket.js'
import { readSourceNotes } from './read-source-notes.js'
import type { MirrorNote, Note } from './types.js'
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
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketId })

  const links = await storage.getLinksByMirrorBucketId(userId, mirrorBucket.id)
  const cachedMirrorNotes = new Map<string, MirrorNote>()

  for (const sourceBucketId of unique(links.map(link => link.sourceBucketId))) {
    const notes = await readSourceNotes({ userId, sourceBucketId })

    for (const note of notes) {
      const matchingLink = getMatchingLinks(note, links).find(link => link.sourceBucketId === sourceBucketId)

      if (matchingLink) {
        let mirrorNote = note.mirrorVendorEntity ? cachedMirrorNotes.get(serializeVendorEntityQuery(note.mirrorVendorEntity)) : undefined

        if (!mirrorNote) {
          if (isMirrorNote(note) && !isNoteStoredInMirrorBucket(note, mirrorBucket)) {
            mirrorNote = await createMirrorNote({ userId, mirrorBucketId, note })
            await deleteMirrorNote({ mirrorVendorEntity: note.mirrorVendorEntity })
          } else {
            mirrorNote = await updateOrCreateMirrorNote({ userId, mirrorBucketId, note })
          }

          if (note.mirrorVendorEntity) {
            cachedMirrorNotes.set(serializeVendorEntityQuery(note.mirrorVendorEntity), mirrorNote)
          }
        }

        await updateOrCreateSourceNote({
          userId,
          sourceBucketId,
          mirrorVendorEntityQuery: note.mirrorVendorEntity,
          note: mirrorNote,
        })
      } else if (isMirrorNote(note) && isNoteStoredInMirrorBucket(note, mirrorBucket)) {
        await detachSourceNote({
          userId,
          sourceBucketId,
          mirrorVendorEntityQuery: note.mirrorVendorEntity,
        })
      }
    }
  }
}

function serializeVendorEntityQuery(vendorEntityQuery: VendorEntityQuery): string {
  return `${vendorEntityQuery.vendorEntityType}_${vendorEntityQuery.id}`
}

function getMatchingLinks(note: Note, links: Link[]) {
  const matchingLinks = links.filter(link => !link.template || isMatching({ content: note.content, template: link.template }))
  const stopOnMatchIndex = matchingLinks.findIndex(link => link.settings.stopOnMatch)
  return stopOnMatchIndex === -1 ? matchingLinks : matchingLinks.slice(0, stopOnMatchIndex + 1)
}

function isMirrorNote(note: Note): note is MirrorNote {
  return Boolean(note.mirrorVendorEntity)
}

function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array))
}
