import { NotFoundError } from '../errors.js'
import { registry, type Deps } from '../registry.js'
import { getMatchingNotes } from './get-matching-notes.js'
import { syncNote } from './sync-note.js'

export async function syncNotes(
  payload: { linkId: number, userId: number },
  { storage }: Deps<'storage'> = registry.export(),
) {
  const { linkId, userId } = payload

  const link = await storage.getLinkById(userId, linkId)
  if (!link) throw new NotFoundError()

  const notes = await getMatchingNotes({
    userId,
    sourceBucketId: link.sourceBucketId,
    template: link.template,
  })

  for (const note of notes) {
    await syncNote({ note, link, userId })
  }
}
