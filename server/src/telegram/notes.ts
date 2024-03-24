import type { Message } from 'telegraf/types'
import { createTelegramMessageVendorEntity } from './vendor-entity.js'
import type { Note } from '../types.js'

export function telegramMessageToNote(message: Message.TextMessage): Note {
  const content = message.text

  return {
    content,
    tags: extractTagsFromMessage(message),
    status: 'not_started',
    vendorEntities: [createTelegramMessageVendorEntity(message)],
  }
}

export function extractTagsFromMessage(message: Message.TextMessage): string[] {
  return (message.entities ?? [])
    .filter(entity => entity.type === 'hashtag')
    .map(entity => message.text.slice(entity.offset + 1, entity.offset + entity.length))
    .map(tag => tag.replaceAll('_', ' '))
}

export function noteToTelegramMessageText(note: { content: string; tags: string[] }): string {
  const hashtags = note.tags.map(tag => `#${tag.replaceAll(' ', '_')}`)
  const missingHashtags = hashtags.filter(tag => !note.content.includes(tag))
  if (missingHashtags.length > 0) {
    return note.content === ''
      ? missingHashtags.join(' ')
      : `${note.content}\n\n${missingHashtags.join(' ')}`
  }

  return note.content === '' ? '<empty>' : note.content
}
