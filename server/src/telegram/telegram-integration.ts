import { Telegraf } from 'telegraf'
import type { Context, Event, EventEmitter, EventHandler, Integration, Note, UsersRepository, VendorEntity, Writable } from '../types.js'
import { editedMessage, message } from 'telegraf/filters'
import { logger } from '../common/logger.js'
import { getVendorEntity, mergeVendorEntities, createVendorEntityHash } from '../vendor-entity.js'
import { noteToTelegramMessageText, parseTelegramMessage, telegramMessageToNote } from './notes.js'
import { createTelegramMessageVendorEntity, createTelegramMessageVendorEntityQuery } from './vendor-entity.js'
import { withLocale } from '../localization/telegram.js'
import { env } from '../env.js'

export class TelegramIntegration implements Writable, EventHandler {
  private bot: Telegraf

  constructor(
    telegramBotToken: string,
    private readonly eventEmitter: EventEmitter,
    private readonly usersRepository: UsersRepository,
  ) {
    this.bot = new Telegraf(telegramBotToken)
  }

  async handle(event: Event, context: Context): Promise<void> {
    if (event.type === 'telegram:new_message') {
      const { message } = event.payload
      const { content, tags } = parseTelegramMessage(message)

      if (message.reply_to_message) {
        const originalMessage = message.reply_to_message
        const originalNote = await this.bucket.getNoteByVendorEntities(createTelegramMessageVendorEntityQuery(originalMessage))

        if (originalNote) {
          await this.eventEmitter.emit({
            type: 'update_note',
            payload: {
              note: {
                content,
                tags,
                status: originalNote.status,
                vendorEntities: mergeVendorEntities(originalNote.vendorEntities, createTelegramMessageVendorEntity(message)),
              }
            }
          }, context)
        } else {
          await this.eventEmitter.emit({
            type: 'create_note',
            payload: {
              note: telegramMessageToNote(message)
            }
          }, context)
        }

        await this.eventEmitter.emit({
          type: 'telegram:delete_message',
          payload: {
            chatId: originalMessage.chat.id,
            messageId: originalMessage.message_id,
          }
        }, context)
      } else {
        await this.eventEmitter.emit({
          type: 'create_note',
          payload: {
            note: telegramMessageToNote(message)
          }
        }, context)
      }
    }

    if (event.type === 'telegram:delete_message') {
      const { chatId, messageId } = event.payload

      try {
        await this.bot.telegram.deleteMessage(chatId, messageId)
      } catch (err) {
        logger.warn({ err, chatId, messageId }, 'Could not delete old message for the updated note')

        try {
          await this.bot.telegram.setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji: '💩' }])
        } catch (err) {
          logger.warn({ err, chatId, messageId }, 'Could not set a "deleted" message reaction')
        }
      }
    }
  }

  async listen(): Promise<void> {
    this.bot.telegram.setMyCommands([
      { command: 'start', description: 'Get help' },
    ])

    this.bot.use((context, next) => {
      if (!env.USE_TEST_MODE && context.from?.is_bot) return
      return next()
    })

    this.bot.use(async (context, next) => {
      if (!context.from || !context.chat) return
      if (context.from.id !== context.chat.id) {
        await context.reply('Only private chats are supported')
        return
      }

      const integration: Integration = {
        id: String(context.from.id),
        type: 'telegram',
        metadata: {
          chatId: context.chat.id,
        }
      }

      context.state.integration = integration
      return next()
    })

    this.bot.use(async (context, next) => {
      if (!context.from) return

      const integration = context.state.integration as Integration

      let user = await this.usersRepository.getUserByIntegration(integration)
      if (!user) {
        user = await this.usersRepository.createUserFromIntegration(integration)
      }

      context.state.user = user
      return next()
    });

    this.bot.on(message('text'), async (context) => {
      await this.eventEmitter.emit({
        type: 'telegram:new_message',
        payload: { message: context.message },
      }, { user: context.state.user })
    })

    this.bot.on(editedMessage('text'), async (context) => {
      await this.eventEmitter.emit({
        type: 'telegram:edited_message',
        payload: { message: context.editedMessage },
      }, { user: context.state.user })
    })

    this.bot.on('message_reaction', async (context) => {
      await this.eventEmitter.emit({
        type: 'telegram:message_reaction',
        payload: { messageReaction: context.messageReaction },
      }, { user: context.state.user })
    })

    this.bot.catch(async (err, context) => {
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

    process.once('SIGINT', () => this.bot.stop('SIGINT'))
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'))

    logger.info({}, 'Starting telegram bot')
    this.bot.launch({
      allowedUpdates: ['message', 'edited_message', 'message_reaction', 'callback_query']
    }).catch((err) => {
      logger.fatal({ err }, 'Could not launch telegram bot')
      process.exit(1)
    })
  }

  async storeNote(note: Note, context: Context): Promise<VendorEntity> {
    logger.debug({ note }, 'Syncing telegram message for note')

    const integration = await this.usersRepository.getIntegrationByUserId(context.user.id, 'telegram')
    if (!integration) {
      throw new Error('User does not have a telegram integration')
    }

    const vendorEntity = getVendorEntity(note.vendorEntities, 'telegram_message')
    const messageText = noteToTelegramMessageText(note)

    // Note is not created on telegram yet
    if (!vendorEntity) {
      const message = await this.bot.telegram.sendMessage(integration.metadata.chatId, messageText)
      return createTelegramMessageVendorEntity(message)
    }

    // Note has been updated
    if (vendorEntity.hash === createVendorEntityHash(messageText)) {
      return vendorEntity
    }

    let message
    try {
      message = await this.bot.telegram.editMessageText(vendorEntity.metadata.chatId, vendorEntity.metadata.messageId, undefined, messageText)
      if (message === true) throw new Error('Message was not edited')
    } catch (err) {
      logger.warn({ err, note }, 'Could not edit message for the updated note, sending a new message instead')
      message = await this.bot.telegram.sendMessage(integration.metadata.chatId, messageText)

      // delete previous message
      await this.eventEmitter.emit({
        type: 'telegram:delete_message',
        payload: {
          chatId: vendorEntity.metadata.chatId,
          messageId: vendorEntity.metadata.messageId,
        }
      }, context)
    }

    return createTelegramMessageVendorEntity(message)
  }

  async deleteNote(note: Note, context: Context): Promise<void> {
    logger.debug({ note }, 'Syncing telegram message for note')

    const vendorEntity = getVendorEntity(note.vendorEntities, 'telegram_message')
    if (!vendorEntity) return

    await this.eventEmitter.emit({
      type: 'telegram:delete_message',
      payload: {
        chatId: vendorEntity.metadata.chatId,
        messageId: vendorEntity.metadata.messageId,
      }
    }, context)
  }
}
