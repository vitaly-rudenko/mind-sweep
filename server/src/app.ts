import pg from 'pg'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import Router from 'express-promise-router'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { Redis } from 'ioredis'
import { logger } from './common/logger.js'
import { env } from './env.js'
import { registry } from './registry.js'
import { Telegraf } from 'telegraf'
import { getAppVersion } from './common/utils.js'
import { localize } from './localization/localize.js'
import { withChatId } from './common/telegram.js'
import { withLocale } from './localization/telegram.js'
import { createWebAppUrlGenerator } from './web-app/utils.js'
import { ApiError, NotAuthenticatedError, NotFoundError } from './common/errors.js'
import { withUserId } from './users/telegram.js'
import { ZodError, z } from 'zod'
import { PostgresStorage } from './users/postgres-storage.js'
import { formatTelegramUserName } from './format-telegram-user-name.js'
import { Client } from '@notionhq/client'
import { message } from 'telegraf/filters'
import type { Message } from 'telegraf/types'
import { match } from './match.js'

async function start() {
  if (env.USE_TEST_MODE) {
    logger.warn({}, 'Test mode is enabled')
  }

  registry.value('redis', new Redis(env.REDIS_URL))

  const pgClient = new pg.Client(env.DATABASE_URL)
  await pgClient.connect()

  if (env.LOG_DATABASE_QUERIES) {
    const query = pgClient.query.bind(pgClient)

    pgClient.query = (...args: any[]) => {
      logger.debug({ args }, 'Database query')
      // @ts-expect-error
      return query(...args)
    }
  }

  const telegramBotToken = env.TELEGRAM_BOT_TOKEN
  if (!telegramBotToken) {
    throw new Error('Telegram bot token is not defined')
  }

  const bot = new Telegraf(telegramBotToken, { telegram: { testEnv: env.USE_TEST_MODE } })

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  registry.values({
    webAppName: env.WEB_APP_NAME,
    webAppUrl: env.WEB_APP_URL,
    debugChatId: env.DEBUG_CHAT_ID,
    botInfo: await bot.telegram.getMe(),
    localize,
    telegram: bot.telegram,
    version: getAppVersion(),
  })

  const generateWebAppUrl = createWebAppUrlGenerator(registry.export())

  registry.values({
    generateWebAppUrl,
  })

  bot.telegram.setMyCommands([
    { command: 'start', description: 'Get help' },
  ])

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception')
    process.exit(1)
  })

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection')
    process.exit(1)
  })

  bot.use((context, next) => {
    if (!env.USE_TEST_MODE && context.from?.is_bot) return
    return next()
  })

  bot.use(withUserId())
  bot.use(withChatId())
  bot.use(withLocale())

  const storage = new PostgresStorage(pgClient)
  const botInfo = await bot.telegram.getMe()

  bot.command('start', async (context) => {
    const user = await storage.getUserByLoginMethod('telegram', String(context.from.id))

    if (!user) {
      await storage.createUserWithIntegration({
        name: context.from.first_name,
        locale: 'en',
      }, {
        name: formatTelegramUserName(context.from),
        loginMethodType: 'telegram',
        queryId: String(context.from.id),
        metadata: {
          userId: context.from.id,
        }
      }, {
        name: formatTelegramUserName(context.from),
        integrationType: 'telegram',
        queryId: String(context.from.id),
        metadata: {
          userId: context.from.id,
        }
      }, {
        name: context.chat.type === 'private' ? formatTelegramUserName(botInfo) : context.chat.title,
        bucketType: 'telegram_chat',
        queryId: String(context.chat.id),
        metadata: {
          chatId: context.chat.id,
        }
      })

      await context.reply('Welcome to the MindSweep! 🎉')
    } else {
      await context.reply('Welcome back! 🙂')
    }
  })

  bot.use(async (context, next) => {
    if (!context.from) return

    context.state.user = await storage.getUserByLoginMethod('telegram', String(context.from.id))
    if (!context.state.user) {
      if (context.chat?.type === 'private') {
        await context.reply('We don\'t know you yet 👀. Please use /start command to get started.')
      }
      return
    }

    return next()
  })

  const TAGGED_MESSAGE_TEXT_REGEX = /^(?<content>.+?)(?:\n\n(?<tags>(?:#\w+\s*)+))?$/s

  function parseTelegramMessage(message: Pick<Message.TextMessage, 'text' | 'entities'>): { content: string; tags: string[] } {
    const match = message.text.match(TAGGED_MESSAGE_TEXT_REGEX)

    return {
      content: match?.groups?.content ?? '',
      tags: extractTagsFromMessage(message),
    }
  }

  function extractTagsFromMessage(message: Pick<Message.TextMessage, 'text' | 'entities'>): string[] {
    return [...new Set(
      (message.entities ?? [])
      .filter(entity => entity.type === 'hashtag')
      .map(entity => message.text.slice(entity.offset + 1, entity.offset + entity.length))
      .map(tag => tag.replaceAll('_', ' '))
    )]
  }

  function createVendorEntityHash(input: string) {
    return crypto.createHash('md5').update(input).digest('hex')
  }

  bot.on(message('text'), async (context) => {
    const { content, tags } = parseTelegramMessage(context.message)

    const links = await storage.queryLinksByMirrorBucket(context.state.user.id, 'telegram_chat', String(context.chat.id))

    for (const link of links) {
      if (link.template && match(content, link.template) === undefined) continue

      const sourceBucket = await storage.getBucketById(context.state.user.id, link.sourceBucketId)
      if (!sourceBucket) continue
      const integration = await storage.getIntegrationById(context.state.user.id, sourceBucket.integrationId)
      if (!integration) continue

      if (integration.integrationType === 'notion' && sourceBucket.bucketType === 'notion_database') {
        const notion = new Client({ auth: integration.metadata.integrationSecret });
        const notionDatabase = await notion.databases.retrieve({ database_id: sourceBucket.metadata.databaseId });

        const vendorEntityId = `${context.message.chat.id}_${context.message.message_id}`
        const vendorEntityHash = createVendorEntityHash(context.message.text)
        const vendorEntityMetadata = {
          chatId: context.message.chat.id,
          messageId: context.message.message_id,
        }

        await notion.pages.create({
          parent: { database_id: notionDatabase.id },
          properties: {
            'Name': {
              type: 'title',
              title: [
                {
                  type: 'text',
                  text: {
                    content: content,
                  },
                },
              ],
            },
            'Tags': {
              type: 'multi_select',
              multi_select: [...tags, ...link.defaultTags ?? []].map((tag) => ({ name: tag })),
            },
            'Status': {
              type: 'select',
              select: {
                name: 'Not started'
              },
            },
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
  })

  bot.command('app', async (context) => {
    await context.reply(generateWebAppUrl())
  })

  const app = express()
  app.use(helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    }
  }))
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGIN.includes(origin)) {
        callback(null, origin)
      } else {
        callback(new ApiError({ code: 'INVALID_CORS_ORIGIN', status: 403 }))
      }
    }
  }))
  app.use(express.json())

  const router = Router()

  const authenticateWebAppSchema = z.object({ initData: z.string() })
  const initDataUserSchema = z.object({
    id: z.number(),
    first_name: z.string(),
    username: z.string().optional(),
  })

  router.post('/authenticate-web-app', async (req, res) => {
    const { initData } = authenticateWebAppSchema.parse(req.body)

    if (!checkWebAppSignature(env.TELEGRAM_BOT_TOKEN, initData)) {
      throw new ApiError({
        code: 'INVALID_SIGNATURE',
        status: 400,
      })
    }

    const initDataUser = new URLSearchParams(initData).get('user')
    const telegramUser = initDataUser ? initDataUserSchema.parse(JSON.parse(initDataUser)) : undefined
    if (!telegramUser) {
      throw new ApiError({
        code: 'INVALID_INIT_DATA',
        status: 400,
      })
    }

    const user = await storage.getUserByLoginMethod('telegram', String(telegramUser.id))
    if (!user) {
      throw new NotFoundError()
    }

    res.json(jwt.sign({
      user,
    }, env.TOKEN_SECRET))
  })

  const authTokenSchema = z.object({
    user: z.object({
      id: z.number(),
      name: z.string(),
      locale: z.string(),
    })
  })

  function createAuthMiddleware(input: { tokenSecret: string }) {
    return (req: Request, _res: Response, next: NextFunction) => {
      const token = req.headers['authorization']?.slice(7) // 'Bearer ' length
      if (!token) {
        throw new NotAuthenticatedError('Authentication token not provided')
      }

      try {
        req.user = authTokenSchema.parse(jwt.verify(token, input.tokenSecret)).user
      } catch (err) {
        logger.warn({ err }, 'Invalid authentication token')
        throw new NotAuthenticatedError('Invalid authentication token')
      }

      next()
    }
  }

  router.use(createAuthMiddleware({ tokenSecret: env.TOKEN_SECRET }))

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

  const createLinkSchema = z.object({
    sourceBucketId: z.number(),
    mirrorBucketId: z.number(),
    priority: z.number().min(0).max(100),
    template: z.string().min(1).optional(),
    defaultTags: z.array(z.string().min(1)).min(1).optional(),
  })

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

  const SERIALIZED_VENDOR_ENTITY_REGEX = /^(.+?):(\{.+\}):(.+)$/

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
        const message = await bot.telegram.sendMessage(mirrorBucket.metadata.chatId, content)

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

  app.use(router)

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // TODO: test "err instanceof ZodError"
    if (!(err instanceof ApiError) && !(err instanceof ZodError)) {
      logger.error({
        err,
        req: {
          url: req.url,
          ...req.headers && Object.keys(req.headers).length > 0 ? {
              headers: {
              ...req.headers,
              ...typeof req.headers.authorization === 'string'
                ? { authorization: req.headers.authorization.slice(0, 10) + '...' }
                : undefined,
            }
          } : undefined,
          ...req.params && Object.keys(req.params).length > 0 ? { params: req.params } : undefined,
          ...req.query && Object.keys(req.query).length > 0 ? { query: req.query } : undefined,
          ...req.body && Object.keys(req.body).length > 0 ? { body: req.body } : undefined,
        }
      }, 'Unhandled API error')
    }

    if (res.headersSent) return
    if (err instanceof ApiError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          ...err.message ? { message: err.message } : undefined,
          ...err.context ? { context: err.context } : undefined,
        }
      })
    } else if (err instanceof ZodError) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          context: err.errors,
        }
      })
    } else {
      res.sendStatus(500)
    }
  })

  bot.catch(async (err, context) => {
    logger.error({
      err,
      ...context && {
        context: {
          ...context.update && Object.keys(context.update).length > 0 ? { update: context.update } : undefined,
          ...context.botInfo && Object.keys(context.botInfo).length > 0 ? { botInfo: context.botInfo } : undefined,
          ...context.state && Object.keys(context.state).length > 0 ? { state: context.state } : undefined,
        }
      },
    }, 'Unhandled telegram error')
  })

  logger.info({}, 'Starting server')
  await new Promise(resolve => app.listen(env.PORT, () => resolve(undefined)))

  logger.info({}, 'Starting telegram bot')
  bot.launch({
    allowedUpdates: ['message', 'edited_message', 'message_reaction', 'callback_query']
  }).catch((err) => {
    logger.fatal({ err }, 'Could not launch telegram bot')
    process.exit(1)
  })
}

// https://gist.github.com/konstantin24121/49da5d8023532d66cc4db1136435a885?permalink_comment_id=4574538#gistcomment-4574538
function checkWebAppSignature(botToken: string, initData: string) {
  const urlParams = new URLSearchParams(initData)

  const hash = urlParams.get('hash')
  urlParams.delete('hash')
  urlParams.sort()

  let dataCheckString = ''
  for (const [key, value] of urlParams.entries()) {
      dataCheckString += `${key}=${value}\n`
  }
  dataCheckString = dataCheckString.slice(0, -1)

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken)
  const calculatedHash = crypto.createHmac('sha256', secret.digest()).update(dataCheckString).digest('hex')

  return calculatedHash === hash
}

start()
  .then(() => logger.info({}, 'Started!'))
  .catch((err) => {
    logger.fatal({ err }, 'Unexpected starting error')
    process.exit(1)
  })

