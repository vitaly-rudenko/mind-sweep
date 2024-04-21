import type { Message } from 'telegraf/types'
import { type Deps, registry } from '../registry.js'
import type { MirrorNote, Note } from './types.js'
import { TelegramError } from 'telegraf'
import { createVendorEntityHash } from '../vendor-entities/create-vendor-entity-hash.js'
import { createTelegramVendorEntity } from '../telegram/create-telegram-vendor-entity.js'
import { deleteMirrorNote } from './delete-mirror-note.js'
import { NotFoundError, UnsupportedActionError } from '../errors.js'

export async function updateOrCreateMirrorNote(
  input: { userId: number, mirrorBucketId: number, note: Note },
  { storage }: Deps<'storage'> = registry.export()
): Promise<MirrorNote> {
  const { userId, mirrorBucketId, note } = input

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketId })

  // TODO: check if Note belongs to the Bucket?

  if (mirrorBucket.bucketType === 'telegram_chat') {
    return telegramBucketUpdateOrCreateMirrorNote({ userId, mirrorBucketId, note })
  } else {
    throw new UnsupportedActionError('Unsupported MirrorBucketType', { mirrorBucketType: mirrorBucket.bucketType })
  }
}

async function telegramBucketUpdateOrCreateMirrorNote(
  input: { userId: number; note: Note; mirrorBucketId: number },
  { storage, telegram }: Deps<'storage' | 'telegram'> = registry.export()
): Promise<MirrorNote> {
  const { userId, mirrorBucketId, note } = input

  const mirrorBucket = await storage.getBucketById(userId, mirrorBucketId)
  if (!mirrorBucket) throw new NotFoundError('MirrorBucket not found', { mirrorBucketId })
  if (mirrorBucket.bucketType !== 'telegram_chat') throw new UnsupportedActionError('Unsupported MirrorBucketType', { mirrorBucketType: mirrorBucket.bucketType })

  if (!note.mirrorVendorEntity) {
    const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)

    return {
      ...note,
      mirrorVendorEntity: createTelegramVendorEntity(message),
    }
  }

  if (note.mirrorVendorEntity.vendorEntityType !== 'telegram_message') {
    throw new UnsupportedActionError('Unsupported MirrorVendorEntityType', { mirrorVendorEntityType: note.mirrorVendorEntity.vendorEntityType })
  }

  try {
    let message: Message.TextMessage | true = await telegram.editMessageText(note.mirrorVendorEntity.metadata.chatId, note.mirrorVendorEntity.metadata.messageId, undefined, note.content)
    if (message !== true) {
      return {
        ...note,
        mirrorVendorEntity: createTelegramVendorEntity(message),
      }
    }
  } catch (err) {
    if (err instanceof TelegramError && ['Bad Request: message to edit not found', 'Bad Request: message can\'t be edited'].includes(err.response.description)) {
      let message: Message.TextMessage
      try {
        message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content, {
          reply_parameters: {
            chat_id: note.mirrorVendorEntity.metadata.chatId,
            message_id: note.mirrorVendorEntity.metadata.messageId,
          }
        })
      } catch (err) {
        if (err instanceof TelegramError && err.response.description === 'Bad Request: message to reply not found') {
          message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)
        } else {
          throw err
        }
      }

      // Try to delete the old message
      await deleteMirrorNote({ mirrorVendorEntity: note.mirrorVendorEntity })

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
}
