import fs from 'fs'
import https from 'https'
import pg from 'pg'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import crypto from 'crypto'
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
import { editedMessage, message } from 'telegraf/filters'
import { Client } from '@notionhq/client'
import type { Message } from 'telegraf/types'
import type { PageObjectResponse, QueryDatabaseResponse } from '@notionhq/client/build/src/api-endpoints.js'

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

  const databaseId = env.NOTION_TEST_DATABASE_ID
  const notion = new Client({ auth: env.NOTION_TEST_INTEGRATION_SECRET })

  type TelegramMessageVendorEntity = {
    type: 'telegram_message'
    id: string
    metadata: {
      version: number
      chatId: number
      messageId: number
      fromUserId: number
      hash: string
    }
  }

  type NotionPageVendorEntity = {
    type: 'notion_page'
    id: string
    metadata: {
      version: number
      databaseId: string
      pageId: string
    }
  }

  type VendorEntity = TelegramMessageVendorEntity | NotionPageVendorEntity

  type Note = {
    content: string
    tags: string[]
    vendorEntities: VendorEntity[]
    status: 'not_started' | 'in_progress' | 'done' | 'to_delete'
  }

  function hashNoteContent(content: string) {
    return crypto.createHash('md5').update(content).digest('hex')
  }

  function createTelegramMessageVendorEntityId(message: {
    message_id: number
    chat: { id: number }
  }) {
    return `${message.chat.id}_${message.message_id}`
  }

  function createTelegramMessageVendorEntity(message: {
    text: string
    message_id: number
    chat: { id: number }
    from?: { id: number }
  }): TelegramMessageVendorEntity {
    if (!message.from) {
      throw new Error('Invalid vendor entity: message.from is missing')
    }

    return {
      type: 'telegram_message',
      id: `${message.chat.id}_${message.message_id}`,
      metadata: {
        version: 1,
        chatId: message.chat.id,
        messageId: message.message_id,
        fromUserId: message.from.id,
        hash: hashNoteContent(message.text),
      }
    }
  }

  function createNotionPageVendorEntity(databaseId: string, pageId: string): NotionPageVendorEntity {
    return {
      type: 'notion_page',
      id: `${databaseId}_${pageId}`,
      metadata: {
        version: 1,
        databaseId,
        pageId,
      }
    }
  }

  function getTelegramVendorEntity(vendorEntities: VendorEntity[]) {
    return vendorEntities.find((entity): entity is TelegramMessageVendorEntity => entity.type === 'telegram_message')
  }

  function getNotionPageVendorEntity(vendorEntities: VendorEntity[]) {
    return vendorEntities.find((entity): entity is NotionPageVendorEntity => entity.type === 'notion_page')
  }

  function telegramMessageToNote(message: Message.TextMessage, vendorEntities: VendorEntity[] = []): Note {
    const content = message.text
    const tags = (message.entities ?? [])
      .filter(entity => entity.type === 'hashtag')
      .map(entity => content.slice(entity.offset + 1, entity.offset + entity.length))

    return {
      content,
      tags,
      status: 'not_started',
      vendorEntities: [
        ...vendorEntities.filter(entity => entity.type !== 'telegram_message'),
        createTelegramMessageVendorEntity(message),
      ],
    }
  }

  function serializeVendorEntityToNotionProperties(vendorEntities: VendorEntity[]): Parameters<Client['pages']['create']>[0]['properties'] {
    const properties: Parameters<Client['pages']['create']>[0]['properties'] = {}

    for (const vendorEntity of vendorEntities) {
      if (vendorEntity.type === 'notion_page') continue

      properties[`entity:${vendorEntity.type}`] = {
        type: 'rich_text',
        rich_text: [
          {
            type: 'text',
            text: {
              content: `${vendorEntity.id}:${JSON.stringify(vendorEntity.metadata)}`
            }
          }
        ]
      }
    }

    return properties
  }

  function serializeNoteToNotion(note: Note): Parameters<Client['pages']['create']>[0]['properties'] {
    return {
      'Name': {
        type: 'title',
        title: [
          {
            type: 'text',
            text: {
              content: note.content,
            },
          },
        ],
      },
      'Tags': {
        type: 'multi_select',
        multi_select: note.tags.map((tag) => ({ name: tag })),
      },
      'Status': {
        type: 'select',
        select: {
          name: 'Not started',
        },
      },
      ...serializeVendorEntityToNotionProperties(note.vendorEntities),
    }
  }

  function serializeVendorEntitiesToNotionDatabaseQueryFilter(vendorEntities: VendorEntity[]): Parameters<Client['databases']['query']>[0]['filter'] {
    return {
      property: `entity:${vendorEntities[0].type}`,
      rich_text: {
        starts_with: `${vendorEntities[0].id}:`,
      },
    }
  }

  async function setupNotionDatabase(databaseId: string) {
    await notion.databases.update({
      database_id: databaseId,
      properties: {
        'Name': {
          type: 'title',
          title: {},
        },
        'Tags': {
          type: 'multi_select',
          multi_select: {},
        },
        'Status': {
          type: 'select',
          select: {
            options: [
              { name: 'Not started' },
              { name: 'In progress' },
              { name: 'Done' },
              { name: 'To delete' },
            ]
          },
        },
        'entity:telegram_message': {
          type: 'rich_text',
          rich_text: {},
        }
      }
    })
  }

  await setupNotionDatabase(databaseId)

  async function createNotionNote(note: Note) {
    await setupNotionDatabase(databaseId)

    await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
      properties: serializeNoteToNotion(note),
    })
  }

  async function updateNotionNote(note: Note) {
    const notionPageVendorEntity = getNotionPageVendorEntity(note.vendorEntities)
    if (!notionPageVendorEntity) throw new Error('Unsupported vendor entity type')

    await setupNotionDatabase(notionPageVendorEntity.metadata.databaseId)

    await notion.pages.update({
      page_id: notionPageVendorEntity.metadata.pageId,
      properties: serializeNoteToNotion(note),
    })
  }

  async function deleteNotionNote(note: Note) {
    const notionPageVendorEntity = getNotionPageVendorEntity(note.vendorEntities)
    if (!notionPageVendorEntity) throw new Error('Unsupported vendor entity type')

    await notion.pages.update({
      page_id: notionPageVendorEntity.metadata.pageId,
      archived: true,
    })
  }

  async function findNotionNote(vendorEntityType: VendorEntity['type'], vendorEntityId: VendorEntity['id']) {
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 1,
      filter: {
        property: `entity:${vendorEntityType}`,
        rich_text: {
          starts_with: `${vendorEntityId}:`,
        },
      }
    })

    return parseNotionQueryDatabaseResponse(response).at(0)
  }

  function parseNotionQueryDatabaseResponse(response: QueryDatabaseResponse) {
    const notes: Note[] = []

    for (const page of response.results) {
      if (!('properties' in page)) continue

      const nameProperty = page.properties['Name']
      const tagsProperty = page.properties['Tags']
      const statusProperty = page.properties['Status']
      const entityProperties: [string, PageObjectResponse['properties'][number]][] = Object
        .entries(page.properties)
        .filter(([name]) => name.startsWith('entity:'))

      if (!('title' in nameProperty)) continue
      if (!('multi_select' in tagsProperty) || !Array.isArray(tagsProperty.multi_select)) continue
      if (!('select' in statusProperty) || !statusProperty.select || 'options' in statusProperty.select) continue

      const content = nameProperty.title.at(0)?.plain_text
      if (!content) continue

      const tags = tagsProperty.multi_select.map((tag) => tag.name)
      const status = statusProperty.select.name === 'Not started'
        ? 'not_started'
        : statusProperty.select.name === 'In progress'
          ? 'in_progress'
          : statusProperty.select.name === 'Done'
            ? 'done'
            : statusProperty.select.name === 'To delete'
              ? 'to_delete'
              : 'not_started'

      const vendorEntities: VendorEntity[] = [createNotionPageVendorEntity(databaseId, page.id)]
      for (const [name, property] of entityProperties) {
        if (!('rich_text' in property)) continue

        const type = name.slice('entity:'.length)
        if (type !== 'telegram_message') continue

        const serialized = property.rich_text[0]?.plain_text
        if (!serialized) continue

        vendorEntities.push({
          type,
          id: serialized.slice(0, serialized.indexOf(':')),
          metadata: JSON.parse(serialized.slice(serialized.indexOf(':') + 1)),
        })
      }

      notes.push({
        content,
        tags,
        vendorEntities,
        status,
      })
    }

    return notes
  }

  bot.command('sync', async (context) => {
    const response = await notion.databases.query({
      database_id: databaseId,
    })

    const notes = parseNotionQueryDatabaseResponse(response)

    for (const note of notes) {
      const telegramVendorEntity = getTelegramVendorEntity(note.vendorEntities)

      if (telegramVendorEntity) {
        if (note.status === 'to_delete') {
          try {
            await bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
          } catch {
            console.log('Could not delete message')

            try {
              await bot.telegram.setMessageReaction(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, [{ type: 'emoji', emoji: '💩' }])
            } catch {
              console.log('Could not set a message reaction')
            }
          }

          await deleteNotionNote(note)
        } else {
          if (telegramVendorEntity.metadata.hash !== hashNoteContent(note.content)) {
            try {
              await bot.telegram.editMessageText(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, undefined, note.content)
            } catch {
              const message = await bot.telegram.sendMessage(context.chat.id, note.content)
              const syncedNote = telegramMessageToNote(message, note.vendorEntities)
              await updateNotionNote(syncedNote)
              await bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
            }
          }
        }
      } else {
        const message = await bot.telegram.sendMessage(context.chat.id, note.content)
        const syncedNote = telegramMessageToNote(message, note.vendorEntities)
        await updateNotionNote(syncedNote)
      }
    }

    await context.deleteMessage()
  })

  bot.on(message('text'), async (context) => {
    console.log('message(text):', JSON.stringify(context.update, null, 2))

    if (context.message.reply_to_message) {
      const originalMessage = context.message.reply_to_message
      const notionNote = await findNotionNote('telegram_message', createTelegramMessageVendorEntityId(originalMessage))

      if (notionNote) {
        await updateNotionNote(telegramMessageToNote(context.message, notionNote.vendorEntities))
        await bot.telegram.deleteMessage(originalMessage.chat.id, originalMessage.message_id)
      } else {
        await createNotionNote(telegramMessageToNote(context.message))
      }
    } else {
      await createNotionNote(telegramMessageToNote(context.message))
    }

    await context.react({ type: 'emoji', emoji: '👀' })
    setTimeout(async () => context.react(), 3000)
  })

  bot.on(editedMessage('text'), async (context) => {
    console.log('editedMessage(text):', JSON.stringify(context.update, null, 2))

    const note = telegramMessageToNote(context.editedMessage)

    await setupNotionDatabase(databaseId)
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 1,
      filter: serializeVendorEntitiesToNotionDatabaseQueryFilter(note.vendorEntities),
    })

    const pageId = response.results[0]?.id

    if (!pageId) {
      await createNotionNote(note)
    } else {
      await notion.pages.update({
        page_id: pageId,
        properties: serializeNoteToNotion(note),
      })
    }

    console.log(pageId, response)

    await context.react({ type: 'emoji', emoji: '👀' })
    setTimeout(async () => context.react(), 3000)
  })

  bot.on('message_reaction', async (context) => {
    console.log('message_reaction:', JSON.stringify(context.update, null, 2))

    const reaction = context.messageReaction.new_reaction[0]
    if (!reaction) return

    if (reaction.type === 'emoji' && reaction.emoji === '💩') {
      const notionNote = await findNotionNote('telegram_message', createTelegramMessageVendorEntityId(context.messageReaction))

      try {
        await context.deleteMessage()
      } catch {
        console.log('Could not delete message')
      }

      if (notionNote) {
        await deleteNotionNote(notionNote)
      }
    }
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
    allowedUpdates: ['message', 'edited_message', 'message_reaction', 'message_reaction_count', 'callback_query']
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

