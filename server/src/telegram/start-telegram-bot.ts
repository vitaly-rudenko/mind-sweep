import { stripIndent } from 'common-tags'
import { Telegraf, TelegramError } from 'telegraf'
import { editedMessage, message } from 'telegraf/filters'
import { logger } from '../logging/logger.js'
import { env } from '../env.js'
import { formatTelegramUserName } from './format-telegram-user-name.js'
import { registry } from '../registry.js'
import type { Note } from '../notes/types.js'
import { createTelegramVendorEntity } from './create-telegram-vendor-entity.js'
import { parseTelegramMessage } from './parse-telegram-message.js'
import { getLocaleFromTelegramLanguageCode } from './get-locale-from-telegram-language-code.js'
import { reactToAcknowledgeMessage } from './react-to-acknowledge-message.js'
import { handleMirrorNoteDeleted } from '../notes/handle-mirror-note-deleted.js'
import { handleMirrorNoteCreated } from '../notes/handle-mirror-note-created.js'
import { handleMirrorNoteUpdated } from '../notes/handle-mirror-note-updated.js'

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

  await bot.telegram.setChatMenuButton({
    menuButton: {
      text: 'App',
      type: 'web_app',
      web_app: {
        url: env.WEB_APP_URL,
      }
    }
  })

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Get started' },
  ])

  bot.use((context, next) => {
    if (!env.USE_TEST_MODE && context.from?.is_bot || context.from?.id === botInfo.id) return
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
    const message = context.message
    const { content, tags } = parseTelegramMessage(message)

    const userId = context.state.user.id
    const note: Note = {
      content,
      tags,
      mirrorVendorEntity: createTelegramVendorEntity(message),
    }

    if (message.reply_to_message) {
      await handleMirrorNoteUpdated({
        note,
        userId,
        mirrorBucketQuery: {
          queryId: String(context.chat.id),
          bucketType: 'telegram_chat',
        },
        mirrorVendorEntityQuery: {
          id: `${message.reply_to_message.chat.id}_${message.reply_to_message.message_id}`,
          vendorEntityType: 'telegram_message',
        }
      })

      try {
        await bot.telegram.deleteMessage(message.reply_to_message.chat.id, message.reply_to_message.message_id)
      } catch (err) {
        logger.error({ err }, 'Could not delete message')
      }
    } else {
      await handleMirrorNoteCreated({
        note,
        userId,
        mirrorBucketQuery: {
          queryId: String(context.chat.id),
          bucketType: 'telegram_chat',
        },
      })
    }

    await reactToAcknowledgeMessage(message.chat.id, message.message_id)
  })

  bot.on(editedMessage('text'), async (context) => {
    const message = context.editedMessage
    const { content, tags } = parseTelegramMessage(message)

    const userId = context.state.user.id
    const note: Note = {
      content,
      tags,
      mirrorVendorEntity: createTelegramVendorEntity(message),
    }

    await handleMirrorNoteUpdated({
      note,
      userId,
      mirrorBucketQuery: {
        queryId: String(context.chat.id),
        bucketType: 'telegram_chat',
      },
      mirrorVendorEntityQuery: {
        id: `${message.chat.id}_${message.message_id}`,
        vendorEntityType: 'telegram_message',
      }
    })

    await reactToAcknowledgeMessage(message.chat.id, message.message_id)
  })

  bot.on('message_reaction', async (context) => {
    const newReaction = context.messageReaction.new_reaction.at(0)

    if (newReaction?.type === 'emoji' && newReaction.emoji === '💩') {
      await handleMirrorNoteDeleted({
        userId: context.state.user.id,
        mirrorBucketQuery: {
          queryId: String(context.chat.id),
          bucketType: 'telegram_chat',
        },
        mirrorVendorEntityQuery: {
          id: `${context.chat.id}_${context.messageReaction.message_id}`,
          vendorEntityType: 'telegram_message',
        }
      })

      try {
        await context.deleteMessage()
      } catch (err) {
        if (err instanceof TelegramError && err.response.description === 'Bad Request: message can\'t be deleted for everyone') {
          await reactToAcknowledgeMessage(context.messageReaction.chat.id, context.messageReaction.message_id)
        } else {
          logger.error({ err }, 'Could not delete message')
          throw err
        }
      }
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