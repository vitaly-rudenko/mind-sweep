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

export type Note = {
  content: string
  tags: string[]
  vendorEntities: VendorEntity[]
  status: 'not_started' | 'in_progress' | 'done' | 'to_delete'
}

export type Bucket = {
  getNotes(): Promise<Note[]>
  getNote(type: VendorEntityType, id: VendorEntityId): Promise<Note | undefined>
  storeNote(note: Note): Promise<Note>
  deleteNote(note: Note): Promise<void>
}
