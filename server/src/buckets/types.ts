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

export type BucketQuery = Pick<Bucket, 'queryId' | 'bucketType'>
