import type { Telegraf } from 'telegraf'
import type { NotionDatabase } from './NotionDatabase.js'
import { message, editedMessage } from 'telegraf/filters'
import type { VendorEntity, TelegramMessageVendorEntity, Note } from './types.js'
import type { Message } from 'telegraf/types'
import { createNoteHash } from './create-note-hash.js'

export class TelegramProducer {
  constructor(
    private readonly bot: Telegraf,
    private readonly database: NotionDatabase,
  ) {}

  produce() {
    this.bot.command('sync', async (context) => {
      const notes = await this.database.getNotes()

      for (const note of notes) {
        await this.syncNote(context.chat.id, note)
      }

      await context.deleteMessage()
    })

    this.bot.on(message('text'), async (context) => {
      console.log('message(text):', JSON.stringify(context.update, null, 2))

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
      console.log('editedMessage(text):', JSON.stringify(context.update, null, 2))

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
      console.log('message_reaction:', JSON.stringify(context.update, null, 2))

      const reaction = context.messageReaction.new_reaction[0]
      if (!reaction) return

      if (reaction.type === 'emoji' && reaction.emoji === '💩') {
        const existingNote = await this.database.getNote('telegram_message', this.createTelegramMessageVendorEntityId(context.messageReaction))

        try {
          await context.deleteMessage()
        } catch {
          console.log('Could not delete message')
        }

        if (existingNote) {
          await this.database.deleteNote(existingNote)
        }
      }
    })
  }

  async syncNote(chatId: number, note: Note) {
    const telegramVendorEntity = this.getTelegramMessageVendorEntity(note.vendorEntities)

    // New note
    if (!telegramVendorEntity) {
      const message = await this.bot.telegram.sendMessage(chatId, note.content)
      await this.database.updateNote(this.telegramMessageToNote(message, note.vendorEntities))
      return
    }

    // Deleted note
    if (note.status === 'to_delete') {
      try {
        await this.bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
      } catch {
        console.log('Could not delete message')

        try {
          await this.bot.telegram.setMessageReaction(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, [{ type: 'emoji', emoji: '💩' }])
        } catch {
          console.log('Could not set a message reaction')
        }
      }

      await this.database.deleteNote(note)
      return
    }

    // Updated note
    if (telegramVendorEntity.hash === createNoteHash(note.content)) return
    let message
    try {
      message = await this.bot.telegram.editMessageText(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, undefined, note.content)
      if (message === true) throw new Error('Message was not edited')
    } catch {
      message = await this.bot.telegram.sendMessage(chatId, note.content)
      this.bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
        .catch(() => console.log('Could not delete old message'))
    }

    await this.database.updateNote(this.telegramMessageToNote(message, note.vendorEntities))
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
        version: 1,
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
