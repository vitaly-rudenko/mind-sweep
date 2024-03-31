export type IntegrationType = 'telegram' | 'notion'

type IntegrationMetadata = {
  telegram: {
    userId: number
    username?: string
  }
  notion: {
    integrationSecret: string
  }
}

export type Integration<T extends IntegrationType | unknown = unknown> = {
  id: number
  name: string
  userId: number
  queryId: string
  integrationType: T
  metadata: T extends IntegrationType ? IntegrationMetadata[T] : unknown
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

export type Bucket<T extends BucketType> = {
  id: number
  name: string
  userId: number
  queryId: string
  bucketType: T
  metadata: T extends BucketType ? BucketMetadata[T] : unknown
  integrationId: number
}
