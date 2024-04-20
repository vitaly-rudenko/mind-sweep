import type { Message } from 'telegraf/types'
import { type Deps, registry } from '../registry.js'
import type { Note } from './types.js'
import { TelegramError } from 'telegraf'
import { createVendorEntityHash } from '../vendor-entities/create-vendor-entity-hash.js'
import { createTelegramVendorEntity } from '../telegram/create-telegram-vendor-entity.js'
import { doesNoteBelongToMirrorBucket } from './does-note-belong-to-mirror-bucket.js'

export async function updateOrCreateMirrorNote(
  input: {
    userId: number
    mirrorBucketId: number
    note: Note
  },
  { storage, telegram }: Deps<'storage' | 'telegram'> = registry.export()
): Promise<Note> {
  const { userId, mirrorBucketId, note } = input

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new Error('Mirror bucket not found')

  if (!doesNoteBelongToMirrorBucket(note, mirrorBucket)) {
    throw new Error('Note does not belong to mirror bucket')
  }

  if (mirrorBucket.bucketType === 'telegram_chat') {
    if (note.mirrorVendorEntity) {
      if (note.mirrorVendorEntity.vendorEntityType === 'telegram_message') {
        try {
          let message: Message.TextMessage | true = await telegram.editMessageText(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId, undefined, note.content)
          if (message !== true) {
            return {
              ...note,
              mirrorVendorEntity: createTelegramVendorEntity(message),
            }
          }
        } catch (err) {
          if (err instanceof TelegramError && err.response.description === 'Bad Request: message can\'t be edited') {
            const message = await telegram.sendMessage(note.mirrorVendorEntity.metadata.chatId, note.content)

            // TODO: catch errors
            await telegram.deleteMessage(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId)

            return {
              ...note,
              mirrorVendorEntity: createTelegramVendorEntity(message),
            }
          } else if (err instanceof TelegramError && err.response.description === 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message') {
            // ok
          } else {
            throw err
          }
        }

        return {
          ...note,
          mirrorVendorEntity: {
            ...note.mirrorVendorEntity,
            hash: createVendorEntityHash(note.content),
          }
        }
      } else {
        throw new Error('Unsupported vendor entity type for given bucket type')
      }
    } else {
      const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)

      return {
        ...note,
        mirrorVendorEntity: createTelegramVendorEntity(message),
      }
    }
  } else {
    throw new Error(`Unsupported mirror bucket type: ${mirrorBucket.bucketType}`)
  }
}
