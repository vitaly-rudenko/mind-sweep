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

export type Bucket<T extends BucketType | unknown = unknown> = {
  id: number
  name: string
  userId: number
  queryId: string
  bucketType: T
  metadata: T extends BucketType ? BucketMetadata[T] : unknown
  integrationId: number
}

export type LoginMethodType = 'telegram'

export type LoginMethodMetadata = {
  telegram: {
    userId: number
  }
}

export type LoginMethod<T extends LoginMethodType | unknown = unknown> = {
  id: number
  userId: number
  name: string
  queryId: string
  loginMethodType: T
  metadata: T extends LoginMethodType ? LoginMethodMetadata[T] : unknown
}

export type Link = {
  id: number
  userId: number
  sourceBucketId: number
  mirrorBucketId: number
  priority: number
  template?: string
  defaultTags?: string[]
}
