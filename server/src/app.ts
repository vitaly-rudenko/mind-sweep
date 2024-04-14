import pg from 'pg'
import { Redis } from 'ioredis'
import { logger } from './logging/logger.js'
import { env } from './env.js'
import { registry } from './registry.js'
import { localize } from './localization/localize.js'
import { PostgresStorage } from './postgres-storage.js'
import { NotionBucket } from './notion/notion-bucket.js'
import { startTelegramBot } from './telegram/start-telegram-bot.js'
import { startApiServer } from './api/start-api-server.js'
import { getAppVersion } from './utils/get-app-version.js'

pg.types.setTypeParser(pg.types.builtins.NUMERIC, value => parseFloat(value))

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

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception')
    process.exit(1)
  })

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection')
    process.exit(1)
  })

  const storage = new PostgresStorage(pgClient)

  registry.values({ storage })

  const notionBucket = new NotionBucket(storage)

  registry.values({ notionBucket })

  await startTelegramBot()
  await startApiServer()
}

start()
  .then(() => logger.info({}, 'Started!'))
  .catch((err) => {
    logger.fatal({ err }, 'Unexpected starting error')
    process.exit(1)
  })

