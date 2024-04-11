import type { Message } from 'telegraf/types'
import { registry, type Deps } from '../registry.js'
import type { Note, Link, Bucket, VendorEntity } from '../types.js'
import { createTelegramVendorEntity, createVendorEntityHash } from '../utils.js'
import { TelegramError } from 'telegraf'
import { logger } from '../common/logger.js'

export async function agnosticSyncNote(payload: {
  note: Note
  link: Link
  userId: number
}, { storage }: Deps<'storage'> = registry.export()) {
  logger.info({ payload }, 'Agnostic sync note')

  const { note, link, userId } = payload

  const mirrorBucket = await storage.getBucketById(userId, link.mirrorBucketId)
  if (!mirrorBucket) throw new Error(`Bucket not found: ${link.mirrorBucketId}`)

  if (note.vendorEntity) {
    if (note.vendorEntity.hash !== createVendorEntityHash(note.content)) {
      const vendorEntity = await updateVendorEntity({ note })

      await updateNote({
        note: { ...note, vendorEntity },
        sourceBucketId: link.sourceBucketId,
        userId,
      })
    }
  } else {
    const vendorEntity = await createVendorEntity({ note, mirrorBucket })

    await updateNote({
      note: { ...note, vendorEntity },
      sourceBucketId: link.sourceBucketId,
      userId,
    })
  }
}

// Vendor selector function
async function updateNote(payload: { note: Note; sourceBucketId: number; userId: number }, { notionBucket }: Deps<'notionBucket'> = registry.export()) {
  logger.info({ payload }, 'Updating note')

  const { note, sourceBucketId, userId } = payload

  if (note.noteType === 'notion_page') {
    await notionBucket.updateNote({ note, bucketId: sourceBucketId, userId })
  } else {
    throw new Error('Unsupported note type')
  }
}

// Vendor selector function
async function updateVendorEntity(input: { note: Note }, { telegram }: Deps<'telegram'>= registry.export()): Promise<VendorEntity> {
  logger.info({ input }, 'Updating vendor entity')

  const { note } = input
  if (!note.vendorEntity) throw new Error('Note has no vendor entity')

  if (note.vendorEntity.vendorEntityType === 'telegram_message') {
    try {
      let message: Message.TextMessage | true = await telegram.editMessageText(note.vendorEntity.metadata.chatId, note.vendorEntity.metadata.messageId, undefined, note.content)
      if (message !== true) {
        return createTelegramVendorEntity(message)
      }
    } catch (err) {
      if (err instanceof TelegramError && err.response.description === 'Bad Request: message can\'t be edited') {
        const message = await telegram.sendMessage(note.vendorEntity.metadata.chatId, note.content, {
          reply_parameters: {
            chat_id: note.vendorEntity.metadata.chatId,
            message_id: note.vendorEntity.metadata.messageId,
          }
        })

        return createTelegramVendorEntity(message)
      } else if (err instanceof TelegramError && err.response.description === 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message') {
        // ok
      } else {
        throw err
      }
    }

    return {
      ...note.vendorEntity,
      hash: createVendorEntityHash(note.content),
    }
  } else {
    throw new Error('Unsupported vendor entity type')
  }
}

// Vendor selector function
async function createVendorEntity(input: { note: Note; mirrorBucket: Bucket }, { telegram }: Deps<'telegram'>= registry.export()): Promise<VendorEntity> {
  logger.info({ input }, 'Creating vendor entity')

  const { note, mirrorBucket } = input

  if (mirrorBucket.bucketType === 'telegram_chat') {
    const message = await telegram.sendMessage(mirrorBucket.metadata.chatId, note.content)
    return createTelegramVendorEntity(message)
  } else {
    throw new Error('Unsupported mirror bucket type')
  }
}
