import fs from 'fs'
import https from 'https'
import pg from 'pg'
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
import { ApiError } from './common/errors.js'
import { withUserId } from './users/telegram.js'
import { ZodError } from 'zod'
import { PostgresStorage } from './users/postgres-storage.js'
import type { InitialTelegramContextState, TelegramContextState } from './telegram-context-state.js'
import { formatTelegramUserName } from './format-telegram-user-name.js'

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

  const bot = new Telegraf(telegramBotToken)

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

  bot.use(async (context, next) => {
    if (!context.from || !context.chat) return

    Object.assign(context.state, {
      integrationType: 'telegram',
      integrationQueryId: String(context.from.id),
      bucketType: 'telegram_chat',
      bucketQueryId: String(context.chat.id),
      user: await storage.getUserByIntegrationQueryId(context.state.integrationType, context.state.integrationQueryId),
    } satisfies InitialTelegramContextState)

    return next()
  });

  bot.command('start', async (context) => {
    const { user, locale, integrationQueryId, integrationType, bucketQueryId, bucketType } = context.state as TelegramContextState

    if (!user) {
      await storage.createUserWithIntegration({
        name: context.from.first_name,
        locale,
      }, {
        name: formatTelegramUserName(context.from),
        integrationType,
        queryId: integrationQueryId,
        metadata: {
          userId: context.from.id,
        }
      }, {
        name: context.chat.type === 'private' ? formatTelegramUserName(botInfo) : context.chat.title,
        bucketType,
        queryId: bucketQueryId,
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
    if (context.state.user) return next()
    await context.reply('We don\'t know you yet 👀. Please use /start command to get started.')
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
      // TODO: test "err instanceof ZodError"
      // TODO: return errors to FE
      res.sendStatus(400)
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

  if (env.ENABLE_TEST_HTTPS) {
    logger.warn({}, 'Starting server in test HTTPS mode')
    // https://stackoverflow.com/a/69743888
    const key = fs.readFileSync('./.cert/key.pem', 'utf-8')
    const cert = fs.readFileSync('./.cert/cert.pem', 'utf-8')
    await new Promise(resolve => {
      https.createServer({ key, cert }, app).listen(env.PORT, () => resolve(undefined))
    })
  } else {
    logger.info({}, 'Starting server')
    await new Promise(resolve => app.listen(env.PORT, () => resolve(undefined)))
  }

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

