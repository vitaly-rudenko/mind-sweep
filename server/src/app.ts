import pg from 'pg'
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
import { checkWebAppSignature, createWebAppUrlGenerator } from './web-app/utils.js'
import { ApiError, NotAuthenticatedError, NotFoundError } from './common/errors.js'
import { withUserId } from './users/telegram.js'
import { ZodError, z } from 'zod'
import { PostgresStorage } from './users/postgres-storage.js'
import { formatTelegramUserName } from './format-telegram-user-name.js'
import { message } from 'telegraf/filters'
import { match } from './match.js'
import { parseTelegramMessage, createTelegramVendorEntity } from './utils.js'
import { authenticateWebAppSchema, initDataUserSchema } from './web-app/schemas.js'
import { createIntegrationsRouter } from './integrations/routes.js'
import { createLinksRouter } from './links/routes.js'
import { createBucketsRouter } from './buckets/routes.js'
import type { BucketType, Note } from './types.js'
import { NotionBucket } from './notion/notion-bucket.js'
import { stripIndent } from 'common-tags'

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

  const botInfo = await bot.telegram.getMe()

  registry.values({
    webAppName: env.WEB_APP_NAME,
    webAppUrl: env.WEB_APP_URL,
    debugChatId: env.DEBUG_CHAT_ID,
    botInfo,
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

  registry.values({ storage })

  bot.command('app', async (context) => {
    await context.reply(generateWebAppUrl())
  })

  bot.command('debug', async (context) => {
    await context.reply(stripIndent`
      Chat ID: ${context.chat.id} (${context.chat.type})
      User ID: ${context.from?.id ?? 'unknown'}
    `)
  })

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

  const notionBucket = new NotionBucket(storage)

  registry.values({ notionBucket })

  // Agnostic function
  async function $createNote(payload: { note: Note; userId: number; sourceBucketId: number }) {
    const { note, userId, sourceBucketId } = payload

    const sourceBucket = await storage.getBucketById(userId, sourceBucketId)
    if (!sourceBucket) throw new Error(`Bucket with ID ${sourceBucketId} not found`)

    if (sourceBucket.bucketType === 'notion_database') {
      await notionBucket.createNote({
        note,
        userId,
        bucketId: sourceBucket.id,
      })
    } else {
      throw new Error(`Unsupported source bucket type: ${sourceBucket.bucketType}`)
    }
  }

  // Agnostic function
  async function $onNewNote(payload: { note: Note; userId: number; mirrorBucketType: BucketType; mirrorBucketQueryId: string }) {
    const { note, userId, mirrorBucketType, mirrorBucketQueryId } = payload

    const links = await storage.queryLinksByMirrorBucket(userId, mirrorBucketType, mirrorBucketQueryId)
    for (const link of links) {
      if (link.template && match(note.content, link.template) === undefined) continue

      if (link.defaultTags) {
        note.tags.push(...link.defaultTags)
      }

      await $createNote({ note, userId, sourceBucketId: link.sourceBucketId })
    }
  }

  bot.on(message('text'), async (context) => {
    const { content, tags } = parseTelegramMessage(context.message)

    const note: Note = {
      content,
      tags,
      vendorEntity: createTelegramVendorEntity(context.message),
      noteType: 'telegram_message',
      metadata: {
        chatId: context.message.chat.id,
        messageId: context.message.message_id,
      },
    }

    await $onNewNote({
      note,
      userId: context.state.user.id,
      mirrorBucketType: 'telegram_chat',
      mirrorBucketQueryId: String(context.message.chat.id),
    })
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

  app.use(router)
  app.use(createIntegrationsRouter())
  app.use(createBucketsRouter())
  app.use(createLinksRouter())

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

start()
  .then(() => logger.info({}, 'Started!'))
  .catch((err) => {
    logger.fatal({ err }, 'Unexpected starting error')
    process.exit(1)
  })

