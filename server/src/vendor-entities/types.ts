export type VendorEntity = {
  id: string
  hash: string
} & ({
  vendorEntityType: 'telegram_message'
  metadata: {
    chatId: number
    messageId: number
  }
} | {
  vendorEntityType: 'notion_page'
  metadata: {
    pageId: string
  }
})

export type VendorEntityQuery = Pick<VendorEntity, 'id' | 'vendorEntityType'>

export type VendorEntityType = VendorEntity['vendorEntityType']
