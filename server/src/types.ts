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

export type Note = {
  content: string
  tags: string[]
  vendorEntities: VendorEntity[]
  status: 'not_started' | 'in_progress' | 'done' | 'to_delete'
}
