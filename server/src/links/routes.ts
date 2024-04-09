import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../registry.js'
import { NotFoundError } from '../common/errors.js'
import { createTelegramVendorEntity } from '../utils.js'
import { NotionBucket } from '../notion/notion-bucket.js'
import type { Bucket, Link, Note, VendorEntity } from '../types.js'
import { match } from '../match.js'

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

    let notes
    if (bucket.bucketType === 'notion_database' && integration.integrationType === 'notion') {
      notes = await notionBucket.read({ bucket, integration })
    } else {
      throw new Error('Unsupported source bucket type')
    }

    return notes.filter(note => !template || match(note.content, template))
  }

  // Agnostic function
  async function $updateNote(payload: { note: Note; sourceBucketId: number; userId: number }) {
    const { note, sourceBucketId, userId } = payload

    if (note.noteType === 'notion_page') {
      await notionBucket.updateNote({ note, bucketId: sourceBucketId, userId })
    } else {
      throw new Error('Unsupported note type')
    }
  }

  // Agnostic function
  async function createVendorEntity(input: { note: Note; mirrorBucket: Bucket }): Promise<VendorEntity> {
    const { note, mirrorBucket } = input

    if (mirrorBucket.bucketType === 'telegram_chat') {
      const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)
      return createTelegramVendorEntity(message)
    } else {
      throw new Error('Unsupported mirror bucket type')
    }
  }

  // Agnostic function
  async function $syncNote(payload: {
    note: Note
    link: Link
    userId: number
  }) {
    const { note, link, userId } = payload

    const mirrorBucket = await storage.getBucketById(userId, link.mirrorBucketId)
    if (!mirrorBucket) throw new Error(`Bucket not found: ${link.mirrorBucketId}`)

    if (!note.vendorEntity) {
      const vendorEntity = await createVendorEntity({ note, mirrorBucket })

      await $updateNote({
        note: { ...note, vendorEntity },
        sourceBucketId: link.sourceBucketId,
        userId,
      })
    }
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
      await $syncNote({ note, link, userId: req.user.id })
    }

    res.sendStatus(200)
  })

  return router
}
