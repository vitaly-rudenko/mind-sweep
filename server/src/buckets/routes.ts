import Router from 'express-promise-router'
import { z } from 'zod'
import { registry } from '../registry.js'
import { ApiError } from '../common/errors.js'
import { env } from '../env.js'
import { formatTelegramUserName } from '../format-telegram-user-name.js'
import { initDataUserSchema } from '../web-app/schemas.js'
import { checkWebAppSignature } from '../web-app/utils.js'
import { Client } from '@notionhq/client'

const createBucketSchema = z.discriminatedUnion('bucketType', [
  z.object({
    bucketType: z.literal('notion_database'),
    integrationId: z.number(),
    name: z.string().optional(),
    metadata: z.object({
      databaseId: z.string().min(1),
    })
  }),
  z.object({
    bucketType: z.literal('telegram_chat'),
    integrationId: z.number(),
    name: z.string().optional(),
    metadata: z.object({
      initData: z.string().min(1),
    })
  })
]);

export function createBucketsRouter() {
  const router = Router()

  const { storage, botInfo } = registry.export()

  router.post('/buckets', async (req, res) => {
    const input = createBucketSchema.parse(req.body)

    if (input.bucketType === 'notion_database') {
      const integration = await storage.getIntegrationById(req.user.id, input.integrationId)
      if (integration?.integrationType !== 'notion') {
        throw new ApiError({
          code: 'INVALID_INTEGRATION',
          status: 400,
        })
      }

      const notion = new Client({ auth: integration.metadata.integrationSecret });
      const notionDatabase = await notion.databases.retrieve({ database_id: input.metadata.databaseId });

      await storage.createBucket({
        integrationId: input.integrationId,
        bucketType: 'notion_database',
        name: input.name || ('title' in notionDatabase && notionDatabase.title[0].plain_text) || 'Notion database',
        userId: req.user.id,
        queryId: notionDatabase.id,
        metadata: {
          databaseId: notionDatabase.id,
        }
      })
    } else if (input.bucketType === 'telegram_chat') {
      if (!checkWebAppSignature(env.TELEGRAM_BOT_TOKEN, input.metadata.initData)) {
        throw new ApiError({
          code: 'INVALID_SIGNATURE',
          status: 400,
        })
      }

      const initDataUser = new URLSearchParams(input.metadata.initData).get('user')
      const telegramUser = initDataUser ? initDataUserSchema.parse(JSON.parse(initDataUser)) : undefined
      if (!telegramUser) {
        throw new ApiError({
          code: 'INVALID_INIT_DATA',
          status: 400,
        })
      }

      await storage.createBucket({
        integrationId: input.integrationId,
        bucketType: 'telegram_chat',
        name: input.name || formatTelegramUserName(botInfo),
        userId: req.user.id,
        queryId: String(telegramUser.id),
        metadata: {
          chatId: telegramUser.id,
        }
      })
    } else {
      throw new ApiError({
        code: 'UNSUPPORTED_BUCKET_TYPE',
        status: 400,
      })
    }

    res.sendStatus(201)
  })

  router.get('/buckets', async (req, res) => {
    const buckets = await storage.getBucketsByUserId(req.user.id)
    res.json({ items: buckets })
  })

  router.delete('/buckets/:id', async (req, res) => {
    await storage.deleteBucketById(req.user.id, Number(req.params.id))
    res.sendStatus(204)
  })

  return router
}
