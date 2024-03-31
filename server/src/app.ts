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
import { getAppVersion } from './common/utils.js'
import { localize } from './localization/localize.js'
import { createWebAppUrlGenerator } from './web-app/utils.js'
import { ApiError } from './common/errors.js'
import { ZodError } from 'zod'
import { Client } from '@notionhq/client'
import { NotionIntegration } from './notion/notion-integration.js'
import { TelegramIntegration } from './telegram/telegram-integration.js'
import { InMemoryQueue } from './in-memory-queue.js'

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

  registry.values({
    webAppName: env.WEB_APP_NAME,
    webAppUrl: env.WEB_APP_URL,
    debugChatId: env.DEBUG_CHAT_ID,
    localize,
    version: getAppVersion(),
  })

  const generateWebAppUrl = createWebAppUrlGenerator(registry.export())

  registry.values({
    generateWebAppUrl,
  })

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception')
    process.exit(1)
  })

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection')
    process.exit(1)
  })

  const inMemoryQueue = new InMemoryQueue()
  const notionIntegration = new NotionIntegration(new Client())
  const telegramIntegration = new TelegramIntegration(env.TELEGRAM_BOT_TOKEN, inMemoryQueue)

  inMemoryQueue.registerEventHandler(telegramIntegration)

  await telegramIntegration.listen()

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
}

start()
  .then(() => logger.info({}, 'Started!'))
  .catch((err) => {
    logger.fatal({ err }, 'Unexpected starting error')
    process.exit(1)
  })

