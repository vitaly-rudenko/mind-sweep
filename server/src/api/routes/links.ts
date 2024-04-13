import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../../registry.js'
import { NotionBucket } from '../../notion/notion-bucket.js'
import { match } from '../../templates/match.js'
import { NotFoundError } from '../../errors.js'
import { syncNote } from '../../notes/sync-note.js'
import type { Note } from '../../notes/types.js'
import { syncNotes } from '../../notes/sync-notes.js'

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

  router.post('/links/:id/sync', async (req, res) => {
    await syncNotes({ linkId: Number(req.params.id), userId: req.user.id })
    res.sendStatus(200)
  })

  return router
}
