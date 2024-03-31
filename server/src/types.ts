import type { Message, MessageReactionUpdated } from 'telegraf/types'

export type TelegramMessageVendorEntity = {
  type: 'telegram_message'
  id: string
  hash: string
  metadata: {
    chatId: number
    messageId: number
    fromUserId: number
  }
}

export type NotionPageVendorEntity = {
  type: 'notion_page'
  id: string
  hash: string
  metadata: {
    databaseId: string
    pageId: string
  }
}

export type VendorEntity = TelegramMessageVendorEntity | NotionPageVendorEntity
export type VendorEntityType = VendorEntity['type']
export type VendorEntityId = VendorEntity['id']
export type VendorEntityQuery = Pick<VendorEntity, 'type' | 'id'>

export type Note = {
  content: string
  tags: string[]
  vendorEntities: VendorEntity[]
  status: 'not_started' | 'in_progress' | 'done' | 'to_delete'
}

export type Event = {
  type: 'telegram:new_message'
  payload: {
    message: Message.TextMessage
  }
} | {
  type: 'telegram:edited_message'
  payload: {
    message: Message.TextMessage
  }
} | {
  type: 'telegram:message_reaction'
  payload: {
    messageReaction: MessageReactionUpdated
  }
} | {
  type: 'telegram:delete_message'
  payload: {
    chatId: number
    messageId: number
  }
} | {
  type: 'create_note'
  payload: {
    note: Note
  }
} | {
  type: 'update_note'
  payload: {
    note: Note
  }
}

export type Integration = {
  id: string
} & ({
  type: 'telegram'
  metadata: {
    chatId: number
  }
} | {
  type: 'notion'
  metadata: {
    userId: string
    databaseId: string
    integrationSecret: string
  }
})

export type IntegrationQuery = Pick<Integration, 'id' | 'type'>

export type User = {
  id: string
}

export type Context = {
  user: User
}

export interface Readable {
  getAllNotes(): Promise<Note[]>
  getNoteByVendorEntity(vendorEntityQuery: VendorEntityQuery): Promise<Note | undefined>
}

export interface Writable {
  storeNote(note: Note, context: Context): Promise<VendorEntity>
  deleteNote(note: Note, context: Context): Promise<void>
}

export interface EventEmitter {
  emit(event: Event, context: Context): Promise<void>
}

export interface EventHandler {
  handle(event: Event, context: Context): Promise<void>
}

export interface UsersRepository {
  createUserFromIntegration(integration: Integration): Promise<User>
  getIntegrationByUserId<T extends Integration['type']>(userId: string, type: T): Promise<Extract<Integration, { type: T }> | undefined>
  getUserByIntegration(query: IntegrationQuery): Promise<User | undefined>
}
