import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../registry.js'
import { NotFoundError } from '../common/errors.js'
import { createTelegramVendorEntity } from '../utils.js'
import { NotionBucket } from '../notion/notion-bucket.js'
import type { Note, VendorEntity } from '../types.js'

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

  router.post('/links/:id/sync', async (req, res) => {
    const link = await storage.getLinkById(req.user.id, Number(req.params.id))
    if (!link) throw new NotFoundError()

    const mirrorBucket = await storage.getBucketById(req.user.id, link.mirrorBucketId)
    const sourceBucket = await storage.getBucketById(req.user.id, link.sourceBucketId)
    if (!mirrorBucket || !sourceBucket) throw new NotFoundError()

    let notes: Note[]
    if (sourceBucket.bucketType === 'notion_database') {
      notes = await notionBucket.read({
        bucketId: sourceBucket.id,
        template: link.template,
        userId: req.user.id,
      })
    } else {
      throw new Error('Unsupported source bucket type')
    }

    for (const note of notes) {
      if (!note.vendorEntity) {
        let vendorEntity: VendorEntity
        if (mirrorBucket.bucketType === 'telegram_chat') {
          const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)
          vendorEntity = createTelegramVendorEntity(message)
        } else {
          throw new Error('Unsupported mirror bucket type')
        }

        if (note.noteType !== 'notion_page') {
          throw new Error('Invalid note')
        }

        await notionBucket.updateNote({
          note: { ...note, vendorEntity },
          bucketId: sourceBucket.id,
          userId: req.user.id,
        })
      }
    }

    res.sendStatus(200)
  })

  return router
}
