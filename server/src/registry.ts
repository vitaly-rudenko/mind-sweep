import { DependencyRegistry } from '@vitalyrudenko/dependency-registry'
import type { localize } from './localization/localize.js'
import type { Redis } from 'ioredis'
import type { Telegram } from 'telegraf'
import type { PostgresStorage } from './postgres-storage.js'
import type { NotionBucket } from './notion/notion-bucket.js'

export const registry = new DependencyRegistry<Dependencies>()

export type Dependencies = {
  redis: Redis
  storage: PostgresStorage
  webAppName: string
  webAppUrl: string
  debugChatId: number
  botInfo: Awaited<ReturnType<Telegram['getMe']>>
  botToken: string
  localize: typeof localize
  telegram: Telegram
  version: string
  notionBucket: NotionBucket
}

export type Deps<N extends keyof Dependencies> = Pick<Dependencies, N>
