import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../../registry.js'

const createLinkSchema = z.object({
  sourceBucketId: z.number(),
  mirrorBucketId: z.number(),
  template: z.string().min(1).optional(),
  defaultTags: z.array(z.string().min(1)).min(1).optional(),
  settings: z.object({
    stopOnMatch: z.boolean(),
  }),
})

const updateLinkSchema = z.object({
  sourceBucketId: z.number(),
  priority: z.number().min(0).max(999),
  template: z.string().min(1).optional(),
  defaultTags: z.array(z.string().min(1)).min(1).optional(),
  settings: z.object({
    stopOnMatch: z.boolean(),
  }),
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
      settings: input.settings,
    })

    res.sendStatus(201)
  })

  router.put('/links/:id', async (req, res) => {
    const input = updateLinkSchema.parse(req.body)

    await storage.updateLink(req.user.id, Number(req.params.id), {
      sourceBucketId: input.sourceBucketId,
      priority: input.priority,
      template: input.template,
      defaultTags: input.defaultTags,
      settings: input.settings,
    })

    res.sendStatus(204)
  })

  router.delete('/links/:id', async (req, res) => {
    await storage.deleteLinkById(req.user.id, Number(req.params.id))
    res.sendStatus(204)
  })

  return router
}
