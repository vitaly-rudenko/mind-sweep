export type IntegrationType = 'telegram' | 'notion'

type Metadata = {
  telegram: {
    chatId: number
  }
  notion: {
    databaseId: string
  }
}

export type Integration<T extends IntegrationType | unknown = unknown> = {
  id: number
  userId: number
  queryId: string
  type: T
  metadata: T extends IntegrationType ? Metadata[T] : unknown
}
