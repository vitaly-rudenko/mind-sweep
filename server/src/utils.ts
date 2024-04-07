import crypto from 'crypto'
import type { Message } from 'telegraf/types'

export const SERIALIZED_VENDOR_ENTITY_REGEX = /^(.+?):(\{.+\}):(.+)$/

const TAGGED_MESSAGE_TEXT_REGEX = /^(?<content>.+?)(?:\n\n(?<tags>(?:#\w+\s*)+))?$/s

export function createVendorEntityHash(input: string) {
  return crypto.createHash('md5').update(input).digest('hex')
}

export function parseTelegramMessage(message: Pick<Message.TextMessage, 'text' | 'entities'>): { content: string; tags: string[] } {
  const match = message.text.match(TAGGED_MESSAGE_TEXT_REGEX)

  return {
    content: match?.groups?.content ?? '',
    tags: extractTagsFromMessage(message),
  }
}

function extractTagsFromMessage(message: Pick<Message.TextMessage, 'text' | 'entities'>): string[] {
  return [...new Set(
    (message.entities ?? [])
    .filter(entity => entity.type === 'hashtag')
    .map(entity => message.text.slice(entity.offset + 1, entity.offset + entity.length))
    .map(tag => tag.replaceAll('_', ' '))
  )]
}