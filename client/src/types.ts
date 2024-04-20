export type IntegrationType = 'telegram' | 'notion'

export type IntegrationMetadata = {
  telegram: {
    userId: number
  }
  notion: {
    userId: string
    integrationSecret: string
  }
}

export type Integration<T extends IntegrationType = IntegrationType> = {
  id: number
  name: string
  userId: number
  queryId: string
  integrationType: T
  metadata: IntegrationMetadata[T]
}

export type BucketType = 'telegram_chat' | 'notion_database'

type BucketMetadata = {
  telegram_chat: {
    chatId: number
  }
  notion_database: {
    databaseId: string
  }
}

export type Bucket<T extends BucketType = BucketType> = {
  id: number
  name: string
  userId: number
  queryId: string
  bucketType: T
  metadata: BucketMetadata[T]
  integrationId: number
}

export type LoginMethodType = 'telegram'

export type LoginMethodMetadata = {
  telegram: {
    userId: number
  }
}

export type LoginMethod<T extends LoginMethodType = LoginMethodType> = {
  id: number
  userId: number
  name: string
  queryId: string
  loginMethodType: T
  metadata: LoginMethodMetadata[T]
}

export type Link = {
  id: number
  userId: number
  sourceBucketId: number
  mirrorBucketId: number
  priority: number
  template?: string
  defaultTags?: string[]
  settings: {
    stopOnMatch: boolean
  }
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

export type Note = {
  content: string
  tags: string[]
  sourceVendorEntity?: VendorEntity
  mirrorVendorEntity?: VendorEntity
}
