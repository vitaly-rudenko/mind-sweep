import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../../registry.js'
import { NotionBucket } from '../../notion/notion-bucket.js'
import { match } from '../../templates/match.js'
import { NotFoundError } from '../../errors.js'
import { syncNote } from '../../notes/sync-note.js'
import type { Note } from '../../notes/types.js'

const createLinkSchema = z.object({
  sourceBucketId: z.number(),
  mirrorBucketId: z.number(),
  priority: z.number().min(0).max(100),
  template: z.string().min(1).optional(),
  defaultTags: z.array(z.string().min(1)).min(1).optional(),
})

export function createLinksRouter() {
  const router = Router()

  const { storage, telegram } = registry.export()

  router.post('/links', async (req, res) => {
    const input = createLinkSchema.parse(req.body)

    await storage.createLink({
      userId: req.user.id,
      sourceBucketId: input.sourceBucketId,
      mirrorBucketId: input.mirrorBucketId,
      priority: input.priority,
      template: input.template,
      defaultTags: input.defaultTags,
    })

    res.sendStatus(201)
  })

  router.delete('/links/:id', async (req, res) => {
    await storage.deleteLinkById(req.user.id, Number(req.params.id))
    res.sendStatus(204)
  })

  const notionBucket = new NotionBucket(storage)

  // Agnostic function
  async function getMatchingNotes(input: {
    userId: number
    sourceBucketId: number
    template?: string
  }): Promise<Note[]> {
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

  router.post('/links/:id/sync', async (req, res) => {
    const link = await storage.getLinkById(req.user.id, Number(req.params.id))
    if (!link) throw new NotFoundError()

    const notes = await getMatchingNotes({
      userId: req.user.id,
      sourceBucketId: link.sourceBucketId,
      template: link.template,
    })

    for (const note of notes) {
      await syncNote({ note, link, userId: req.user.id })
    }

    res.sendStatus(200)
  })

  return router
}
