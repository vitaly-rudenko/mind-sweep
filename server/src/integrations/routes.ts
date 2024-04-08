import Router from 'express-promise-router'
import { z } from 'zod'
import { ApiError } from '../common/errors.js'
import { env } from '../env.js'
import { formatTelegramUserName } from '../format-telegram-user-name.js'
import { Client } from '@notionhq/client'
import { registry } from '../registry.js'
import { checkWebAppSignature } from '../web-app/utils.js'
import { initDataUserSchema } from '../web-app/schemas.js'

const createIntegrationSchema = z.discriminatedUnion('integrationType', [
  z.object({
    integrationType: z.literal('notion'),
    name: z.string().optional(),
    metadata: z.object({
      integrationSecret: z.string().min(1),
    })
  }),
  z.object({
    integrationType: z.literal('telegram'),
    name: z.string().optional(),
    metadata: z.object({
      initData: z.string().min(1),
    })
  })
]);

export function createIntegrationsRouter() {
  const { storage } = registry.export()

  const router = Router()

  router.post('/integrations', async (req, res) => {
    const input = createIntegrationSchema.parse(req.body)

    if (input.integrationType === 'notion') {
      const notion = new Client({ auth: input.metadata.integrationSecret });
      const notionUser = await notion.users.me({});

      await storage.createIntegration({
        integrationType: 'notion',
        name: input.name || notionUser.name || 'Notion',
        userId: req.user.id,
        queryId: notionUser.id,
        metadata: {
          userId: notionUser.id,
          integrationSecret: input.metadata.integrationSecret,
        }
      })
    } else if (input.integrationType === 'telegram') {
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

      await storage.createIntegration({
        integrationType: 'telegram',
        name: input.name || formatTelegramUserName(telegramUser),
        userId: req.user.id,
        queryId: String(telegramUser.id),
        metadata: {
          userId: telegramUser.id,
        }
      })
    } else {
      throw new ApiError({
        code: 'UNSUPPORTED_INTEGRATION_TYPE',
        status: 400,
      })
    }

    res.sendStatus(201)
  })

  router.get('/integrations', async (req, res) => {
    const integrations = await storage.getIntegrationsByUserId(req.user.id)
    res.json({ items: integrations })
  })

  router.delete('/integrations/:id', async (req, res) => {
    await storage.deleteIntegrationById(req.user.id, Number(req.params.id))
    res.sendStatus(204)
  })

  return router
}
