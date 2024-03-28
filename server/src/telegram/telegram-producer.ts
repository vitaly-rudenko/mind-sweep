import type { Context, Telegraf } from 'telegraf'
import { message, editedMessage } from 'telegraf/filters'
import type { Note, Bucket } from '../types.js'
import { logger } from '../common/logger.js'
import { createTelegramMessageVendorEntity, createTelegramMessageVendorEntityId } from './vendor-entity.js'
import { createVendorEntityHash, getVendorEntity, mergeVendorEntities } from '../vendor-entity.js'
import { noteToTelegramMessageText, parseTelegramMessage, telegramMessageToNote } from './notes.js'
import type { Message, MessageReactionUpdated } from 'telegraf/types'

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

  async $updateNote(note: Note) {
    await this.bucket.storeNote(note)
    await this.$syncNoteReactions(note)
  }

  async $createNote(note: Note) {
    await this.bucket.storeNote(note)
    await this.$syncNoteReactions(note)
  }

  async $syncNoteReactions(note: Note) {
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

  async $deleteTelegramMessage(message: NonNullable<Message.TextMessage['reply_to_message']>) {
    await this.bot.telegram.deleteMessage(message.chat.id, message.message_id)
  }

  async $onNewTelegramTextMessage(message: Message.TextMessage) {
    const { content, tags } = parseTelegramMessage(message)

    if (message.reply_to_message) {
      const originalMessage = message.reply_to_message
      const originalNote = await this.bucket.getNote('telegram_message', createTelegramMessageVendorEntityId(originalMessage))

      if (originalNote) {
        await this.$updateNote({
          content,
          tags,
          status: originalNote.status,
          vendorEntities: mergeVendorEntities(originalNote.vendorEntities, createTelegramMessageVendorEntity(message)),
        })
      } else {
        await this.$createNote(telegramMessageToNote(message))
      }

      await this.$deleteTelegramMessage(originalMessage)
    } else {
      await this.$createNote(telegramMessageToNote(message))
    }
  }

  async $onEditedTelegramTextMessage(message: Message.TextMessage) {
    const { content, tags } = parseTelegramMessage(message)

    const existingNote = await this.bucket.getNote('telegram_message', createTelegramMessageVendorEntityId(message))
    if (existingNote) {
      await this.$updateNote({
        content,
        tags,
        status: existingNote.status,
        vendorEntities: mergeVendorEntities(existingNote.vendorEntities, createTelegramMessageVendorEntity(message)),
      })
    } else {
      await this.$createNote(telegramMessageToNote(message))
    }
  }

  async $onTelegramMessageReaction(messageReaction: MessageReactionUpdated) {
    const oldReaction = messageReaction.old_reaction[0]
    const newReaction = messageReaction.new_reaction[0]

    let existingNote = await this.bucket.getNote('telegram_message', createTelegramMessageVendorEntityId(messageReaction))
    let keepOriginalMessage = !existingNote
    if (!existingNote) {
      // Create a "recovery" note in the bucket
      existingNote = await this.bucket.storeNote({
        content: '',
        status: 'not_started',
        tags: [],
        vendorEntities: [createTelegramMessageVendorEntity({
          text: '',
          chat: { id: messageReaction.chat.id },
          message_id: messageReaction.message_id,
          ...messageReaction.user && {
            from: { id: messageReaction.user.id }
          },
        })],
      })
    }

    let updatedNote: Note | undefined
    if (newReaction?.type === 'emoji') {
      // Special emojis for deleting note
      if (newReaction.emoji === '💩') {
        await this.bucket.deleteNote(existingNote)
        await this.bot.telegram.deleteMessage(messageReaction.chat.id, messageReaction.message_id)
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
      const syncedNote = await this.syncNote(messageReaction.chat.id, storedNote, { keepOriginalMessage })
      if (syncedNote) {
        await this.$syncNoteReactions(syncedNote)
      }
    }
  }

  produce() {
    this.bot.command('sync', async (context) => {
      await this.syncNotes(context.chat.id)
      await context.deleteMessage()
    })

    this.bot.on(message('text'), async (context) => {
      logger.debug({ update: context.update }, 'Received a new telegram text message')
      await this.$onNewTelegramTextMessage(context.message)
    })

    this.bot.on(editedMessage('text'), async (context) => {
      logger.debug({ update: context.update }, 'Telegram text message has been edited')
      await this.$onEditedTelegramTextMessage(context.editedMessage)
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
          await this.$syncNoteReactions(syncedNote)
        }
      }
    })
  }

  async syncNotes(chatId: number) {
    const notes = await this.bucket.getNotes()
    logger.debug({ chatId, notes }, 'Syncing notes')

    for (const note of notes) {
      const syncedNoted = await this.syncNote(chatId, note)
      if (syncedNoted) {
        await this.$syncNoteReactions(syncedNoted)
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

  // TODO: implement noteToTelegramMessageText(note: { content: string; tags: string[] }): string
  // TODO: implement telegramMessageTextToNote(messageText: string): { content: string; tags: string[] }
}
