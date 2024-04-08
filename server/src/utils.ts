import crypto from 'crypto'
import { oneLineTrim } from 'common-tags'
import type { Message } from 'telegraf/types'
import type { VendorEntity } from './types.js'

export const SERIALIZED_VENDOR_ENTITY_REGEX = new RegExp(oneLineTrim`
  ^(?<vendorEntityType>.+?)
  :(?<id>.+?)
  :(?<serializedMetadata>\{.+\})
  :(?<hash>.+)$
`)

export function parseVendorEntity(serialized: string) {
  const match = serialized.match(SERIALIZED_VENDOR_ENTITY_REGEX)
  if (!match?.groups) throw new Error(`Invalid serialized VendorEntity: ${serialized}`)

  return {
    id: match.groups.id,
    hash: match.groups.hash,
    vendorEntityType: match.groups.vendorEntityType,
    metadata: JSON.parse(match.groups.serializedMetadata),
  } as VendorEntity
}

export function createTelegramVendorEntity(message: Message.TextMessage): VendorEntity {
  return {
    id: `${message.chat.id}_${message.message_id}`,
    hash: createVendorEntityHash(message.text),
    vendorEntityType: 'telegram_message',
    metadata: {
      chatId: message.chat.id,
      messageId: message.message_id,
    }
  }
}

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