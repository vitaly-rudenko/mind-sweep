import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../registry.js'
import { ApiError, NotFoundError } from '../common/errors.js'
import { Client } from '@notionhq/client'
import { match } from '../match.js'
import { createVendorEntityHash } from '../utils.js'

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
    const link = await storage.getLinkById(req.user.id, Number(req.params.id))
    if (!link) throw new NotFoundError()

    const mirrorBucket = await storage.getBucketById(req.user.id, link.mirrorBucketId)
    const sourceBucket = await storage.getBucketById(req.user.id, link.sourceBucketId)
    if (!mirrorBucket || !sourceBucket) throw new NotFoundError()

    if (sourceBucket.bucketType !== 'notion_database' || mirrorBucket.bucketType !== 'telegram_chat') {
      throw new ApiError({ code: 'BAD_REQUEST', status: 400 })
    }

    const mirrorIntegration = await storage.getIntegrationById(req.user.id, mirrorBucket.integrationId)
    const sourceIntegration = await storage.getIntegrationById(req.user.id, sourceBucket.integrationId)
    if (!mirrorIntegration || !sourceIntegration) throw new NotFoundError()

    if (sourceIntegration.integrationType !== 'notion' || mirrorIntegration.integrationType !== 'telegram') {
      throw new ApiError({ code: 'BAD_REQUEST', status: 400 })
    }

    const notion = new Client({ auth: sourceIntegration.metadata.integrationSecret });
    const pages = await notion.databases.query({
      database_id: sourceBucket.metadata.databaseId,
    });

    for (const page of pages.results) {
      if (page.object !== 'page' || !('properties' in page)) continue

      const nameProperty = page.properties['Name']
      if (!nameProperty || nameProperty.type !== 'title') continue

      const content = nameProperty.title[0].plain_text
      if (link.template && match(content, link.template) === undefined) continue

      const telegramMessageProperty = page.properties['entity:telegram_message']
      if (!telegramMessageProperty || telegramMessageProperty.type !== 'rich_text') continue

      if (!telegramMessageProperty?.rich_text?.[0]?.plain_text) {
        const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, content)

        const vendorEntityId = `${message.chat.id}_${message.message_id}`
        const vendorEntityHash = createVendorEntityHash(message.text)
        const vendorEntityMetadata = {
          chatId: message.chat.id,
          messageId: message.message_id,
        }

        await notion.pages.update({
          page_id: page.id,
          properties: {
            'entity:telegram_message': {
              type: 'rich_text',
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `${vendorEntityId}:${JSON.stringify(vendorEntityMetadata)}:${vendorEntityHash}`,
                  },
                },
              ],
            }
          },
        })
      }
    }

    res.sendStatus(200)
  })

  return router
}
