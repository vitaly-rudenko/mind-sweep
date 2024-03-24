import type { Message } from 'telegraf/types'
import { createTelegramMessageVendorEntity } from './vendor-entity.js'
import type { Note } from '../types.js'

export function telegramMessageToNote(message: Message.TextMessage): Note {
  const { content, tags } = parseTelegramMessage(message)

  return {
    content,
    tags,
    status: 'not_started',
    vendorEntities: [createTelegramMessageVendorEntity(message)],
  }
}

const TAGGED_MESSAGE_TEXT_REGEX = /^(?<content>.+?)(?:\n\n(?<tags>(?:#\w+\s*)+))?$/s

export function parseTelegramMessage(message: Pick<Message.TextMessage, 'text' | 'entities'>): { content: string; tags: string[] } {
  const match = message.text.match(TAGGED_MESSAGE_TEXT_REGEX)

  return {
    content: match?.groups?.content ?? '',
    tags: extractTagsFromMessage(message),
  }
}

export function extractTagsFromMessage(message: Pick<Message.TextMessage, 'text' | 'entities'>): string[] {
  return [...new Set(
    (message.entities ?? [])
    .filter(entity => entity.type === 'hashtag')
    .map(entity => message.text.slice(entity.offset + 1, entity.offset + entity.length))
    .map(tag => tag.replaceAll('_', ' '))
  )]
}

export function noteToTelegramMessageText(note: Pick<Note, 'content' | 'tags'>): string {
  const hashtags = note.tags.map(tag => `#${tag.replaceAll(' ', '_')}`)
  const missingHashtags = hashtags.filter(tag => !note.content.includes(tag))
  if (missingHashtags.length > 0) {
    return note.content === ''
      ? missingHashtags.join(' ')
      : `${note.content}\n\n${missingHashtags.join(' ')}`
  }

  return note.content === '' ? '<empty>' : note.content
}
