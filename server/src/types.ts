export type Integration = {
  id: number
  name: string
  userId: number
  queryId: string
} & ({
  integrationType: 'telegram'
  metadata: {
    userId: number
  }
} | {
  integrationType: 'notion'
  metadata: {
    userId: string
    integrationSecret: string
  }
})

export type IntegrationType = Integration['integrationType']

export type Bucket = {
  id: number
  name: string
  userId: number
  queryId: string
  integrationId: number
} & ({
  bucketType: 'telegram_chat'
  metadata: {
    chatId: number
  }
} | {
  bucketType: 'notion_database'
  metadata: {
    databaseId: string
  }
})

export type BucketType = Bucket['bucketType']

export type LoginMethod = {
  id: number
  userId: number
  name: string
  queryId: string
} & ({
  loginMethodType: 'telegram'
  metadata: {
    userId: number
  }
})

export type LoginMethodType = LoginMethod['loginMethodType']

export type Link = {
  id: number
  userId: number
  sourceBucketId: number
  mirrorBucketId: number
  priority: number
  template?: string
  defaultTags?: string[]
}

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

export type Note = {
  content: string
  tags: string[]
  sourceVendorEntity?: VendorEntity
  mirrorVendorEntity?: VendorEntity
}
