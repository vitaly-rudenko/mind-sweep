import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../../registry.js'
import { syncNotes } from '../../notes/sync-notes.js'

const createLinkSchema = z.object({
  sourceBucketId: z.number(),
  mirrorBucketId: z.number(),
  template: z.string().min(1).optional(),
  defaultTags: z.array(z.string().min(1)).min(1).optional(),
})

const updateLinkSchema = z.object({
  priority: z.number().min(0).max(999),
  template: z.string().min(1).optional(),
  defaultTags: z.array(z.string().min(1)).min(1).optional(),
})

export function createLinksRouter() {
  const router = Router()

  const { storage } = registry.export()

  router.post('/links', async (req, res) => {
    const input = createLinkSchema.parse(req.body)

    // TODO: check that user owns both buckets

    await storage.createLink({
      userId: req.user.id,
      sourceBucketId: input.sourceBucketId,
      mirrorBucketId: input.mirrorBucketId,
      template: input.template,
      defaultTags: input.defaultTags,
    })

    res.sendStatus(201)
  })

  router.put('/links/:id', async (req, res) => {
    const input = updateLinkSchema.parse(req.body)

    await storage.updateLink(req.user.id, Number(req.params.id), {
      priority: input.priority,
      template: input.template,
      defaultTags: input.defaultTags,
    })

    res.sendStatus(204)
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
