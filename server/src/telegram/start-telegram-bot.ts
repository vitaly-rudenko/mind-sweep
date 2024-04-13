import { stripIndent } from 'common-tags'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { handleNote } from '../notes/handle-note.js'
import { logger } from '../logging/logger.js'
import { env } from '../env.js'
import { formatTelegramUserName } from './format-telegram-user-name.js'
import { registry } from '../registry.js'
import type { Note } from '../notes/types.js'
import { createTelegramVendorEntity } from './create-telegram-vendor-entity.js'
import { parseTelegramMessage } from './parse-telegram-message.js'
import { getLocaleFromTelegramLanguageCode } from './get-locale-from-telegram-language-code.js'
import { generateWebAppUrl } from '../web-app/generate-web-app-url.js'

export async function startTelegramBot() {
  const { storage, version } = registry.export()

  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN, { telegram: { testEnv: env.USE_TEST_MODE } })

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  const botInfo = await bot.telegram.getMe()

  registry.values({
    telegram: bot.telegram,
    botToken: env.TELEGRAM_BOT_TOKEN,
    botInfo,
  })

  bot.telegram.setMyCommands([
    { command: 'start', description: 'Get help' },
    { command: 'app', description: 'Access the app' },
  ])

  bot.use((context, next) => {
    if (!env.USE_TEST_MODE && context.from?.is_bot) return
    return next()
  })

  bot.command('/version', async (context) => {
    if (!context.from || !context.chat) return

    await context.reply([
      `Version: ${version}`,
      `Bot ID: ${context.botInfo.id}`,
      `User ID: ${context.from.id}`,
      `Chat ID: ${context.chat.id} (${context.chat.type})`,
    ].join('\n'))
  })

  bot.use(async (context, next) => {
    if (!context.from || !context.chat) return // ignore

    context.state.chatId = context.chat.id
    context.state.userId = String(context.from.id)
    context.state.locale = getLocaleFromTelegramLanguageCode(context.from.language_code)

    return next()
  })

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

  bot.on(message('text'), async (context) => {
    const { content, tags } = parseTelegramMessage(context.message)

    const userId = context.state.user.id
    const note: Note = {
      content,
      tags,
      mirrorVendorEntity: createTelegramVendorEntity(context.message),
    }

    await handleNote({
      note,
      userId,
      mirrorBucketQuery: {
        queryId: String(context.chat.id),
        bucketType: 'telegram_chat',
      },
      ...context.message.reply_to_message ? {
        mirrorVendorEntityQuery: {
          id: `${context.message.reply_to_message.chat.id}_${context.message.reply_to_message.message_id}`,
          vendorEntityType: 'telegram_message',
        }
      } : {},
    })

    if (context.message.reply_to_message) {
      await bot.telegram.deleteMessage(context.message.reply_to_message.chat.id, context.message.reply_to_message.message_id)
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

  logger.info({}, 'Starting telegram bot')
  bot.launch({
    allowedUpdates: ['message', 'edited_message', 'message_reaction', 'callback_query']
  }).catch((err) => {
    logger.fatal({ err }, 'Could not launch telegram bot')
    process.exit(1)
  })
}