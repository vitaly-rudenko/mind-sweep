import type { Context, Telegraf } from 'telegraf'
import { message, editedMessage } from 'telegraf/filters'
import type { Note, Bucket } from '../types.js'
import { logger } from '../common/logger.js'
import { createTelegramMessageVendorEntity, createTelegramMessageVendorEntityId } from './vendor-entity.js'
import { createVendorEntityHash, getVendorEntity, mergeVendorEntities } from '../vendor-entity.js'
import { noteToTelegramMessageText, parseTelegramMessage, telegramMessageToNote } from './notes.js'
import type { Message } from 'telegraf/types'

const experimentalEmojiTags = [
  { emoji: '🔥', tag: 'Today' },
  { emoji: '⚡',  tag: 'Urgent' },
  { emoji: '❤', tag: 'Important' },
]

export class TelegramProducer {
  constructor(
    private readonly bot: Telegraf,
    private readonly bucket: Bucket,
  ) {}

  produce() {
    this.bot.command('sync', async (context) => {
      await this.syncNotes(context.chat.id)
      await context.deleteMessage()
    })

    this.bot.on(message('text'), async (context) => {
      logger.debug({ update: context.update }, 'Received a new telegram text message')

      const { content, tags } = parseTelegramMessage(context.message)

      if (context.message.reply_to_message) {
        const originalMessage = context.message.reply_to_message
        const originalNote = await this.bucket.getNote('telegram_message', createTelegramMessageVendorEntityId(originalMessage))

        if (originalNote) {
          const storedNote = await this.bucket.storeNote({
            content,
            tags,
            status: originalNote.status,
            vendorEntities: mergeVendorEntities(originalNote.vendorEntities, createTelegramMessageVendorEntity(context.message)),
          })
          await this.syncNoteReactions(storedNote)
        } else {
          await this.bucket.storeNote(telegramMessageToNote(context.message))
          await this.reactToNewMessage(context)
        }

        await this.bot.telegram.deleteMessage(originalMessage.chat.id, originalMessage.message_id)
      } else {
        await this.bucket.storeNote(telegramMessageToNote(context.message))
        await this.reactToNewMessage(context)
      }
    })

    this.bot.on(editedMessage('text'), async (context) => {
      logger.debug({ update: context.update }, 'Telegram text message has been edited')

      const { content, tags } = parseTelegramMessage(context.editedMessage)

      const existingNote = await this.bucket.getNote('telegram_message', createTelegramMessageVendorEntityId(context.editedMessage))
      if (existingNote) {
        await this.bucket.storeNote({
          content,
          tags,
          status: existingNote.status,
          vendorEntities: mergeVendorEntities(existingNote.vendorEntities, createTelegramMessageVendorEntity(context.editedMessage)),
        })
        await this.syncNoteReactions(existingNote)
      } else {
        await this.bucket.storeNote(telegramMessageToNote(context.editedMessage))
        await this.reactToNewMessage(context)
      }
    })

    this.bot.on('message_reaction', async (context) => {
      logger.debug({ update: context.update }, 'Reaction to telegram message has been changed')

      const oldReaction = context.messageReaction.old_reaction[0]
      const newReaction = context.messageReaction.new_reaction[0]

      let existingNote = await this.bucket.getNote('telegram_message', createTelegramMessageVendorEntityId(context.messageReaction))
      let keepOriginalMessage = !existingNote
      if (!existingNote) {
        // Create a "recovery" note in the bucket
        existingNote = await this.bucket.storeNote({
          content: '',
          status: 'not_started',
          tags: [],
          vendorEntities: [createTelegramMessageVendorEntity({
            text: '',
            chat: { id: context.messageReaction.chat.id },
            message_id: context.messageReaction.message_id,
            ...context.messageReaction.user && {
              from: { id: context.messageReaction.user.id }
            },
          })],
        })
      }

      let updatedNote: Note | undefined
      if (newReaction?.type === 'emoji') {
        // Special emojis for deleting note
        if (newReaction.emoji === '💩') {
          await this.bucket.deleteNote(existingNote)
          await context.deleteMessage()
          return
        }

        // Emojis for setting note status
        if (newReaction.emoji === '💯') {
          updatedNote = { ...existingNote, status: 'done' }
        } else if (newReaction.emoji === '✍') {
          updatedNote = { ...existingNote, status: 'in_progress' }
        }

        const experimentalEmojiTag = experimentalEmojiTags.find(tag => tag.emoji === newReaction.emoji)
        if (experimentalEmojiTag) {
          updatedNote = { ...existingNote, tags: [...existingNote.tags.filter(tag => experimentalEmojiTags.every(t => t.tag !== tag)), experimentalEmojiTag.tag] }
        }
      } else if (!newReaction) {
        if (oldReaction.type === 'emoji' && ['💯', '✍'].includes(oldReaction.emoji)) {
          updatedNote = { ...existingNote, status: 'not_started' }
        }

        if (oldReaction.type === 'emoji') {
          const experimentalEmojiTag = experimentalEmojiTags.find(tag => tag.emoji === oldReaction.emoji)
          if (experimentalEmojiTag) {
            updatedNote = { ...existingNote, tags: existingNote.tags.filter(tag => tag !== experimentalEmojiTag.tag) }
          }
        }
      }

      if (updatedNote) {
        const storedNote = await this.bucket.storeNote(updatedNote)
        const syncedNote = await this.syncNote(context.chat.id, storedNote, { keepOriginalMessage })
        if (syncedNote) {
          await this.syncNoteReactions(syncedNote)
        }
      }
    })
  }

  private async reactToNewMessage(context: Context) {
    try {
      await context.react({ type: 'emoji', emoji: '👀' })
      setTimeout(async () => {
        try {
          context.react()
        } catch (err) {
          logger.warn({ err }, 'Could remove reaction from a new message')
        }
      }, 3000)
    } catch (err) {
      logger.warn({ err }, 'Could add reaction to a new message')
    }
  }

  async syncNotes(chatId: number) {
    const notes = await this.bucket.getNotes()
    logger.debug({ chatId, notes }, 'Syncing notes')

    for (const note of notes) {
      const syncedNoted = await this.syncNote(chatId, note)
      if (syncedNoted) {
        await this.syncNoteReactions(syncedNoted)
      }
    }
  }

  async syncNote(chatId: number, note: Note, options?: { keepOriginalMessage?: boolean }) {
    logger.debug({ note }, 'Syncing telegram message for note')

    const telegramVendorEntity = getVendorEntity(note.vendorEntities, 'telegram_message')
    const messageText = noteToTelegramMessageText(note)

    // New note
    if (!telegramVendorEntity) {
      const message = await this.bot.telegram.sendMessage(chatId, messageText)

      return this.bucket.storeNote({
        content: note.content,
        status: note.status,
        tags: note.tags,
        vendorEntities: mergeVendorEntities(note.vendorEntities, createTelegramMessageVendorEntity(message)),
      })
    }

    // Deleted note
    if (note.status === 'to_delete') {
      try {
        await this.bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
      } catch (err) {
        logger.warn({ err, note }, 'Could not delete message marked as "to_delete"')

        try {
          await this.bot.telegram.setMessageReaction(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, [{ type: 'emoji', emoji: '💩' }])
        } catch (err) {
          logger.warn({ err, note }, 'Could not set a "deleted" message reaction')
        }
      }

      await this.bucket.deleteNote(note)
      return undefined
    }

    // Updated note
    if (telegramVendorEntity.hash === createVendorEntityHash(messageText)) {
      return note
    }

    let message
    try {
      message = await this.bot.telegram.editMessageText(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId, undefined, messageText)
      if (message === true) throw new Error('Message was not edited')
    } catch (err) {
      logger.warn({ err, note }, 'Could not edit message for the updated note, sending a new message instead')
      message = await this.bot.telegram.sendMessage(
        chatId,
        messageText,
        options?.keepOriginalMessage
          ? { reply_parameters: { chat_id: telegramVendorEntity.metadata.chatId, message_id: telegramVendorEntity.metadata.messageId } }
          : undefined
      )

      if (!options?.keepOriginalMessage) {
        try {
          await this.bot.telegram.deleteMessage(telegramVendorEntity.metadata.chatId, telegramVendorEntity.metadata.messageId)
        } catch (err) {
          logger.warn({ err, telegramVendorEntity }, 'Could not delete old message for the updated note')
        }
      }
    }

    return this.bucket.storeNote({
      content: note.content,
      status: note.status,
      tags: note.tags,
      vendorEntities: mergeVendorEntities(note.vendorEntities, createTelegramMessageVendorEntity(message)),
    })
  }

  async syncNoteReactions(note: Note) {
    logger.debug({ note }, 'Syncing telegram reactions for note')

    const telegramVendorEntity = getVendorEntity(note.vendorEntities, 'telegram_message')
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
      logger.warn({ err, note }, 'Could not change message reaction')
    }
  }

  // TODO: implement noteToTelegramMessageText(note: { content: string; tags: string[] }): string
  // TODO: implement telegramMessageTextToNote(messageText: string): { content: string; tags: string[] }
}
