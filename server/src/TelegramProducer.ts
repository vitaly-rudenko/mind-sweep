import type { Telegraf } from 'telegraf'
import type { NotionDatabase } from './NotionDatabase.js'
import { message, editedMessage } from 'telegraf/filters'
import type { VendorEntity, TelegramMessageVendorEntity, Note } from './types.js'
import type { Message } from 'telegraf/types'
import { createNoteHash } from './create-note-hash.js'
import { logger } from './common/logger.js'

export class TelegramProducer {
  constructor(
    private readonly bot: Telegraf,
    private readonly database: NotionDatabase,
  ) {}

  produce() {
    this.bot.command('sync', async (context) => {
      await this.syncNotes(context.chat.id)

      await context.deleteMessage()
    })

    this.bot.on(message('text'), async (context) => {
      logger.debug({ update: context.update }, 'New telegram text message')

      if (context.message.reply_to_message) {
        const originalMessage = context.message.reply_to_message
        const existingNote = await this.database.getNote('telegram_message', this.createTelegramMessageVendorEntityId(originalMessage))

        if (existingNote) {
          await this.database.updateNote(this.telegramMessageToNote(context.message, existingNote.vendorEntities))
          await this.bot.telegram.deleteMessage(originalMessage.chat.id, originalMessage.message_id)
        } else {
          await this.database.createNote(this.telegramMessageToNote(context.message))
        }
      } else {
        await this.database.createNote(this.telegramMessageToNote(context.message))
      }

      await context.react({ type: 'emoji', emoji: '👀' })
      setTimeout(async () => context.react(), 3000)
    })

    this.bot.on(editedMessage('text'), async (context) => {
      logger.debug({ update: context.update }, 'Telegram text message has been edited')

      const existingNote = await this.database.getNote('telegram_message', this.createTelegramMessageVendorEntityId(context.editedMessage))
      const updatedNote = this.telegramMessageToNote(context.editedMessage, existingNote?.vendorEntities)

      if (existingNote) {
        await this.database.updateNote(updatedNote)
      } else {
        await this.database.createNote(updatedNote)
      }

      await context.react({ type: 'emoji', emoji: '👀' })
      setTimeout(async () => context.react(), 3000)
    })

    this.bot.on('message_reaction', async (context) => {
      logger.debug({ update: context.update }, 'Reaction to telegram message has been updated')

      const newReaction = context.messageReaction.new_reaction[0]
      const existingNote = await this.database.getNote('telegram_message', this.createTelegramMessageVendorEntityId(context.messageReaction))
      if (!existingNote) return

      let updatedNote: Note | undefined
      if (newReaction?.type === 'emoji') {
        // Special emojis for deleting note
        if (newReaction.emoji === '💩') {
          await this.database.deleteNote(existingNote)
          await context.deleteMessage()
          return
        }

        // Emojis for setting note status
        if (newReaction.emoji === '💯') {
          updatedNote = { ...existingNote, status: 'done' }
        } else if (newReaction.emoji === '✍') {
          updatedNote = { ...existingNote, status: 'in_progress' }
        }
      } else if (!newReaction) {
        updatedNote = { ...existingNote, status: 'not_started' }
      }

      if (updatedNote) {
        await this.database.updateNote(updatedNote)
        await this.syncNoteReactions(updatedNote)
      }
    })
  }

  async syncNotes(chatId: number) {
    const notes = await this.database.getNotes()
    logger.debug({ notes }, 'Syncing notes')

    for (const note of notes) {
      const syncedNoted = await this.syncNote(chatId, note)
      if (syncedNoted) {
        await this.syncNoteReactions(syncedNoted)
      }
    }
  }

  async syncNote(chatId: number, note: Note) {
    const telegramVendorEntity = this.getTelegramMessageVendorEntity(note.vendorEntities)

    // New note
    if (!telegramVendorEntity) {
      const message = await this.bot.telegram.sendMessage(chatId, note.content)
      const syncedNote = this.telegramMessageToNote(message, note.vendorEntities)
      await this.database.updateNote(syncedNote)
      return syncedNote
    }

    // Deleted note
    if (note.status === 'to_delete') {
      try {
        await this.bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
      } catch (err) {
        logger.warn({ err, note }, 'Could not delete message')

        try {
          await this.bot.telegram.setMessageReaction(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, [{ type: 'emoji', emoji: '💩' }])
        } catch (err) {
          logger.warn({ err, note }, 'Could not set a message reaction')
        }
      }

      await this.database.deleteNote(note)
      return undefined
    }

    // Updated note
    if (telegramVendorEntity.hash === createNoteHash(note.content)) {
      return note
    }

    let message
    try {
      message = await this.bot.telegram.editMessageText(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, undefined, note.content)
      if (message === true) throw new Error('Message was not edited')
    } catch {
      message = await this.bot.telegram.sendMessage(chatId, note.content)
      this.bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
        .catch((err) => logger.warn({ err, telegramVendorEntity }, 'Could not delete old message'))
    }

    const syncedNote = this.telegramMessageToNote(message, note.vendorEntities)
    await this.database.updateNote(syncedNote)

    return syncedNote
  }

  async syncNoteReactions(note: Note) {
    logger.debug({ note }, 'Syncing telegram reactions for note')

    const telegramVendorEntity = this.getTelegramMessageVendorEntity(note.vendorEntities)
    if (!telegramVendorEntity) return

    try {
      await this.bot.telegram.setMessageReaction(
        telegramVendorEntity.metadata.chatId,
        telegramVendorEntity.metadata.messageId,
        note.status === 'done'
          ? [{ type: 'emoji', emoji: '💯' }]
          : note.status === 'in_progress'
            ? [{ type: 'emoji', emoji: '✍' }]
            : undefined,
      )
    } catch (err) {
      logger.warn({ err }, 'Could not set message reaction')
    }
  }

  private getTelegramMessageVendorEntity(vendorEntities: VendorEntity[]) {
    return vendorEntities.find((entity): entity is TelegramMessageVendorEntity => entity.type === 'telegram_message')
  }

  private telegramMessageToNote(message: Message.TextMessage, vendorEntities: VendorEntity[] = []): Note {
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
        this.createTelegramMessageVendorEntity(message),
      ],
    }
  }

  private createTelegramMessageVendorEntity(message: {
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
      hash: createNoteHash(message.text),
      metadata: {
        chatId: message.chat.id,
        messageId: message.message_id,
        fromUserId: message.from.id,
      }
    }
  }

  private createTelegramMessageVendorEntityId(message: { chat: { id: number }; message_id: number }): string {
    return `${message.chat.id}_${message.message_id}`
  }
}
